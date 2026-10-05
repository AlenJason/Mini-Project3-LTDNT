// Quy tắc nghiệp vụ đặt phòng, chạy trên một bản chụp trạng thái (state).
//
// Mọi hàm ở đây đều đồng bộ: BookingEngine nạp state, gọi hàm, rồi ghi state
// mới kèm kiểm tra phiên bản (compare-and-set). Nếu trong lúc đó có instance
// khác đã ghi trước, engine nạp lại và chạy lại từ đầu — nên "kiểm tra trùng
// lịch rồi ghi" vẫn nguyên tử dù server chạy nhiều instance (Vercel Functions):
// hai người bấm đặt cùng một khung giờ thì người đến sau luôn nhận SLOT_TAKEN /
// SLOT_HELD, không bao giờ có lịch trùng.

import { randomUUID } from 'node:crypto'
import type { DaySnapshot, HoldRemoved, HoldRemovedReason, Notice, Result } from '../shared/protocol.ts'
import {
  CHECKIN_GRACE_MINUTES,
  ERROR_MESSAGES,
  HOLD_TTL_MS,
  MAX_ACTIVE_BOOKINGS,
  MAX_PURPOSE_LENGTH,
  SLOT_MINUTES,
  checkinClosesAt,
  checkinOpensAt,
  endsAt,
  isActive,
  isBlocking,
  overlaps,
  validateSlot,
  type ErrorCode,
} from '../shared/rules.ts'
import { addDays, campusDate, campusMinute, formatRange } from '../shared/time.ts'
import type { Booking, BookingRequest, Hold, Room, SlotRequest, User } from '../shared/types.ts'

/** Hold kèm khoá của socket đã tạo nó (không gửi cho client) */
export interface StoredHold extends Hold {
  ownerKey: string
}

export interface ServiceState {
  bookings: Booking[]
  holds: StoredHold[]
}

/** Giữ lịch sử 14 ngày gần nhất, cũ hơn thì bỏ khi ghi state (state nằm trong một khoá Redis) */
const KEEP_DAYS = 14

export type ServiceEvent =
  | { type: 'booking'; booking: Booking }
  | { type: 'hold'; hold: Hold }
  | { type: 'hold_removed'; removed: HoldRemoved }
  | { type: 'notice'; userId: string; notice: Notice }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail<T>(code: ErrorCode): Result<T> {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } }
}

export class BookingService {
  readonly rooms: Map<string, Room>
  private readonly bookings = new Map<string, Booking>()
  /** Mỗi người chỉ giữ một khung giờ tại một thời điểm — key là userId */
  private readonly holds = new Map<string, Hold>()
  /** holdId -> socket đã tạo hold (để nhả hold khi socket mất kết nối) */
  private readonly holdOwners = new Map<string, string>()
  private readonly listeners = new Set<(e: ServiceEvent) => void>()
  private readonly clock: () => number

  constructor(rooms: Room[], state: ServiceState = { bookings: [], holds: [] }, clock: () => number = Date.now) {
    this.rooms = new Map(rooms.map((r) => [r.id, r]))
    for (const b of state.bookings) this.bookings.set(b.id, b)
    for (const { ownerKey, ...hold } of state.holds) {
      this.holds.set(hold.userId, hold)
      this.holdOwners.set(hold.id, ownerKey)
    }
    this.clock = clock
  }

  /** Trạng thái để lưu lại (bỏ lịch quá cũ). */
  exportState(): ServiceState {
    const oldest = addDays(campusDate(this.clock()), -KEEP_DAYS)
    return {
      bookings: this.allBookings().filter((b) => b.date >= oldest),
      holds: this.activeHolds().map((h) => ({ ...h, ownerKey: this.holdOwners.get(h.id) ?? '' })),
    }
  }

  /** Thêm lịch có sẵn (dữ liệu demo), bỏ qua lịch trùng với lịch đang có. */
  importBookings(list: Booking[]): void {
    for (const b of list) {
      const clash = this.allBookings().some(
        (x) => x.roomId === b.roomId && x.date === b.date && isBlocking(x) && overlaps(x, b),
      )
      if (clash || this.bookings.has(b.id)) continue
      this.bookings.set(b.id, b)
      this.emit({ type: 'booking', booking: b })
    }
  }

  hasBookingsOn(date: string): boolean {
    return this.allBookings().some((b) => b.date === date)
  }

  subscribe(fn: (e: ServiceEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: ServiceEvent) {
    for (const fn of this.listeners) fn(e)
  }

  // ---------------------------------------------------------------- queries

  allBookings(): Booking[] {
    return [...this.bookings.values()]
  }

  getBooking(id: string): Booking | undefined {
    return this.bookings.get(id)
  }

  activeHolds(): Hold[] {
    return [...this.holds.values()]
  }

  snapshot(date: string): DaySnapshot {
    const now = this.clock()
    return {
      date,
      bookings: this.allBookings().filter((b) => b.date === date && isBlocking(b)),
      holds: this.activeHolds().filter((h) => h.date === date && h.expiresAt > now),
    }
  }

  /** Lịch của một người: tất cả lịch chưa kết thúc + 30 lịch gần nhất đã kết thúc */
  bookingsOf(userId: string): Booking[] {
    const mine = this.allBookings()
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start)
    const active = mine.filter(isActive)
    const past = mine.filter((b) => !isActive(b)).slice(0, 30)
    return [...active, ...past]
  }

  // ------------------------------------------------------------- validation

  /** Kiểm tra một khung giờ có đặt được cho `user` không. */
  private checkBookable(user: User, req: SlotRequest): ErrorCode | null {
    if (!req || typeof req !== 'object' || typeof req.roomId !== 'string') return 'INVALID_INPUT'
    const room = this.rooms.get(req.roomId)
    if (!room) return 'ROOM_NOT_FOUND'
    const now = this.clock()
    const slotError = validateSlot(req, room, now)
    if (slotError) return slotError

    for (const b of this.bookings.values()) {
      if (b.roomId === req.roomId && b.date === req.date && isBlocking(b) && overlaps(b, req)) {
        return 'SLOT_TAKEN'
      }
    }
    for (const h of this.holds.values()) {
      if (
        h.userId !== user.id &&
        h.roomId === req.roomId &&
        h.date === req.date &&
        h.expiresAt > now &&
        overlaps(h, req)
      ) {
        return 'SLOT_HELD'
      }
    }

    let active = 0
    for (const b of this.bookings.values()) {
      if (b.userId !== user.id || !isActive(b)) continue
      if (b.date === req.date && overlaps(b, req)) return 'SELF_OVERLAP'
      active++
    }
    if (active >= MAX_ACTIVE_BOOKINGS) return 'LIMIT_REACHED'
    return null
  }

  // ------------------------------------------------------------------ holds

  createHold(user: User, req: SlotRequest, ownerKey: string): Result<Hold> {
    const error = this.checkBookable(user, req)
    if (error) return fail(error)

    const previous = this.holds.get(user.id)
    const hold: Hold = {
      id: randomUUID(),
      roomId: req.roomId,
      userId: user.id,
      userName: user.name,
      date: req.date,
      start: req.start,
      end: req.end,
      expiresAt: this.clock() + HOLD_TTL_MS,
    }
    if (previous) this.removeHold(previous, 'replaced')
    this.holds.set(user.id, hold)
    this.holdOwners.set(hold.id, ownerKey)
    this.emit({ type: 'hold', hold })
    return ok(hold)
  }

  releaseHold(userId: string, reason: HoldRemovedReason = 'released'): void {
    const hold = this.holds.get(userId)
    if (hold) this.removeHold(hold, reason)
  }

  /** Nhả mọi hold do một socket tạo ra (gọi khi socket ngắt kết nối). */
  releaseHoldsByOwner(ownerKey: string): void {
    for (const hold of [...this.holds.values()]) {
      if (this.holdOwners.get(hold.id) === ownerKey) this.removeHold(hold, 'disconnected')
    }
  }

  private removeHold(hold: Hold, reason: HoldRemovedReason) {
    if (this.holds.get(hold.userId)?.id !== hold.id) return
    this.holds.delete(hold.userId)
    this.holdOwners.delete(hold.id)
    this.emit({
      type: 'hold_removed',
      removed: { id: hold.id, userId: hold.userId, roomId: hold.roomId, date: hold.date, reason },
    })
  }

  // --------------------------------------------------------------- bookings

  createBooking(user: User, req: BookingRequest): Result<Booking> {
    const error = this.checkBookable(user, req)
    if (error) return fail(error)

    const room = this.rooms.get(req.roomId)!
    if (!Number.isInteger(req.attendees) || req.attendees < 1) return fail('INVALID_INPUT')
    if (req.attendees > room.capacity) return fail('OVER_CAPACITY')
    const purpose = typeof req.purpose === 'string' ? req.purpose.trim().slice(0, MAX_PURPOSE_LENGTH) : ''

    const now = this.clock()
    const booking: Booking = {
      id: randomUUID(),
      roomId: req.roomId,
      userId: user.id,
      userName: user.name,
      date: req.date,
      start: req.start,
      end: req.end,
      purpose: purpose || 'Học nhóm',
      attendees: req.attendees,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    }
    this.bookings.set(booking.id, booking)
    this.releaseHold(user.id, 'booked')
    this.emit({ type: 'booking', booking })
    return ok(booking)
  }

  private ownBooking(user: User, id: string): Result<Booking> {
    const booking = typeof id === 'string' ? this.bookings.get(id) : undefined
    if (!booking) return fail('NOT_FOUND')
    if (booking.userId !== user.id) return fail('FORBIDDEN')
    return ok(booking)
  }

  private update(booking: Booking, patch: Partial<Booking>): Booking {
    const next: Booking = { ...booking, ...patch, updatedAt: this.clock() }
    this.bookings.set(next.id, next)
    this.emit({ type: 'booking', booking: next })
    return next
  }

  /** Huỷ lịch chưa check-in. */
  cancel(user: User, id: string): Result<Booking> {
    const found = this.ownBooking(user, id)
    if (!found.ok) return found
    if (found.data.status !== 'confirmed') return fail('INVALID_STATE')
    return ok(this.update(found.data, { status: 'cancelled' }))
  }

  checkIn(user: User, id: string): Result<Booking> {
    const found = this.ownBooking(user, id)
    if (!found.ok) return found
    const booking = found.data
    if (booking.status !== 'confirmed') return fail('INVALID_STATE')
    const now = this.clock()
    if (now < checkinOpensAt(booking)) return fail('CHECKIN_TOO_EARLY')
    if (now > checkinClosesAt(booking)) return fail('CHECKIN_EXPIRED')
    return ok(this.update(booking, { status: 'checked_in', checkedInAt: now }))
  }

  /** Kết thúc sớm: nhả các khung 30 phút còn lại cho người khác. */
  endEarly(user: User, id: string): Result<Booking> {
    const found = this.ownBooking(user, id)
    if (!found.ok) return found
    const booking = found.data
    const now = this.clock()
    if (booking.status !== 'checked_in' || now >= endsAt(booking)) return fail('INVALID_STATE')

    let end = booking.end
    if (campusDate(now) === booking.date) {
      const nextBoundary = Math.ceil(campusMinute(now) / SLOT_MINUTES) * SLOT_MINUTES
      // Check-in sớm rồi trả phòng trước cả giờ bắt đầu -> nhả toàn bộ lịch
      if (nextBoundary <= booking.start) return ok(this.update(booking, { status: 'cancelled' }))
      end = Math.min(booking.end, nextBoundary)
    }
    return ok(this.update(booking, { status: 'completed', end, originalEnd: booking.end }))
  }

  // ------------------------------------------------------------------ sweep

  /**
   * Chạy định kỳ (mỗi vài giây): hết hạn hold, tự nhả phòng không check-in
   * (no-show) và đóng các lịch đã hết giờ.
   */
  sweep(): void {
    const now = this.clock()
    for (const hold of [...this.holds.values()]) {
      if (hold.expiresAt <= now) this.removeHold(hold, 'expired')
    }
    for (const booking of [...this.bookings.values()]) {
      if (booking.status === 'confirmed' && now > checkinClosesAt(booking)) {
        const updated = this.update(booking, { status: 'no_show' })
        this.emit({
          type: 'notice',
          userId: updated.userId,
          notice: {
            kind: 'no_show',
            bookingId: updated.id,
            message: `Lịch ${updated.roomId} ${formatRange(updated.start, updated.end)} đã tự huỷ vì không check-in trong ${CHECKIN_GRACE_MINUTES} phút đầu.`,
          },
        })
      } else if (booking.status === 'checked_in' && now >= endsAt(booking)) {
        this.update(booking, { status: 'completed' })
      }
    }
  }
}
