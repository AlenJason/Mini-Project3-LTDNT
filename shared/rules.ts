// Quy định đặt phòng (theo mô hình Robin / LibCal). Server dùng các hàm này để
// kiểm tra yêu cầu; app dùng lại để hiển thị và vô hiệu hoá nút trước khi gửi.

import type { Booking, Room, SlotRequest } from './types.ts'
import { addDays, campusDate, campusMinute, daysBetween, isValidDate, toEpoch } from './time.ts'

export const SLOT_MINUTES = 30
/** Một lượt đặt dài tối đa 2 giờ */
export const MAX_BOOKING_MINUTES = 120
/** Mỗi người tối đa 3 lượt đặt chưa kết thúc */
export const MAX_ACTIVE_BOOKINGS = 3
/** Được đặt trước tối đa 7 ngày (hôm nay + 6 ngày tới) */
export const BOOKING_WINDOW_DAYS = 7
/** Giữ chỗ tạm trong lúc điền form */
export const HOLD_TTL_MS = 2 * 60_000
/** Check-in mở trước giờ bắt đầu 10 phút … */
export const CHECKIN_OPENS_BEFORE_MINUTES = 10
/** … và đóng sau giờ bắt đầu 15 phút; quá hạn thì tự nhả phòng */
export const CHECKIN_GRACE_MINUTES = 15
export const MAX_PURPOSE_LENGTH = 120

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_INPUT'
  | 'ROOM_NOT_FOUND'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'MISALIGNED'
  | 'OUTSIDE_HOURS'
  | 'IN_PAST'
  | 'TOO_FAR_AHEAD'
  | 'TOO_LONG'
  | 'OVER_CAPACITY'
  | 'SLOT_TAKEN'
  | 'SLOT_HELD'
  | 'SELF_OVERLAP'
  | 'LIMIT_REACHED'
  | 'INVALID_STATE'
  | 'CHECKIN_TOO_EARLY'
  | 'CHECKIN_EXPIRED'
  | 'BUSY'
  | 'NETWORK'

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Phiên đăng nhập không hợp lệ. Đăng nhập lại để tiếp tục.',
  INVALID_INPUT: 'Thông tin đặt phòng không hợp lệ.',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng này.',
  NOT_FOUND: 'Không tìm thấy lịch đặt này.',
  FORBIDDEN: 'Bạn chỉ thao tác được trên lịch do mình đặt.',
  MISALIGNED: `Giờ đặt phải theo từng khung ${SLOT_MINUTES} phút.`,
  OUTSIDE_HOURS: 'Khung giờ này nằm ngoài giờ mở cửa của phòng.',
  IN_PAST: 'Khung giờ này đã qua.',
  TOO_FAR_AHEAD: `Chỉ đặt trước được tối đa ${BOOKING_WINDOW_DAYS} ngày.`,
  TOO_LONG: `Mỗi lượt đặt dài tối đa ${MAX_BOOKING_MINUTES / 60} giờ.`,
  OVER_CAPACITY: 'Số người vượt quá sức chứa của phòng.',
  SLOT_TAKEN: 'Khung giờ này vừa có người đặt. Chọn khung giờ khác.',
  SLOT_HELD: 'Có người đang giữ khung giờ này. Thử lại sau ít phút hoặc chọn giờ khác.',
  SELF_OVERLAP: 'Bạn đã có lịch ở phòng khác trùng khung giờ này.',
  LIMIT_REACHED: `Bạn đã có ${MAX_ACTIVE_BOOKINGS} lịch chưa sử dụng. Huỷ bớt một lịch để đặt thêm.`,
  INVALID_STATE: 'Lịch đặt này không còn ở trạng thái cho phép thao tác đó.',
  CHECKIN_TOO_EARLY: `Check-in mở trước giờ bắt đầu ${CHECKIN_OPENS_BEFORE_MINUTES} phút.`,
  CHECKIN_EXPIRED: 'Đã quá hạn check-in, phòng đã được nhả cho người khác.',
  BUSY: 'Nhiều người đang thao tác cùng lúc. Thử lại sau vài giây.',
  NETWORK: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
}

export interface Span {
  start: number
  end: number
}

export function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

/** Lịch còn chiếm chỗ trên lịch phòng (không tính lịch đã huỷ / no-show) */
export function isBlocking(b: Booking): boolean {
  return b.status === 'confirmed' || b.status === 'checked_in' || b.status === 'completed'
}

/** Lịch chưa kết thúc — tính vào giới hạn MAX_ACTIVE_BOOKINGS */
export function isActive(b: Booking): boolean {
  return b.status === 'confirmed' || b.status === 'checked_in'
}

/** Đầu khung giờ đang diễn ra, ví dụ 09:47 -> 09:30 */
export function currentSlotStart(minute: number): number {
  return Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES
}

export function slotStarts(room: Pick<Room, 'openMinute' | 'closeMinute'>): number[] {
  const starts: number[] = []
  for (let m = room.openMinute; m + SLOT_MINUTES <= room.closeMinute; m += SLOT_MINUTES) {
    starts.push(m)
  }
  return starts
}

/** Ngày cuối cùng còn được đặt */
export function lastBookableDate(now: number = Date.now()): string {
  return addDays(campusDate(now), BOOKING_WINDOW_DAYS - 1)
}

/** Kiểm tra khung giờ (chưa xét trùng lịch). Trả về mã lỗi hoặc null nếu hợp lệ. */
export function validateSlot(req: SlotRequest, room: Room, now: number): ErrorCode | null {
  const { date, start, end } = req
  if (!isValidDate(date) || !Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
    return 'INVALID_INPUT'
  }
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) return 'MISALIGNED'
  if (start < room.openMinute || end > room.closeMinute) return 'OUTSIDE_HOURS'
  if (end - start > MAX_BOOKING_MINUTES) return 'TOO_LONG'

  const ahead = daysBetween(campusDate(now), date)
  if (ahead < 0) return 'IN_PAST'
  if (ahead >= BOOKING_WINDOW_DAYS) return 'TOO_FAR_AHEAD'
  // Được đặt khung đang diễn ra (vào phòng ngay), nhưng không đặt khung đã qua
  if (ahead === 0 && start < currentSlotStart(campusMinute(now))) return 'IN_PAST'
  return null
}

export function checkinOpensAt(b: Pick<Booking, 'date' | 'start'>): number {
  return toEpoch(b.date, b.start - CHECKIN_OPENS_BEFORE_MINUTES)
}

export function checkinClosesAt(b: Pick<Booking, 'date' | 'start'>): number {
  return toEpoch(b.date, b.start + CHECKIN_GRACE_MINUTES)
}

export function startsAt(b: Pick<Booking, 'date' | 'start'>): number {
  return toEpoch(b.date, b.start)
}

export function endsAt(b: Pick<Booking, 'date' | 'end'>): number {
  return toEpoch(b.date, b.end)
}

export type BookingPhase =
  | 'upcoming' // chưa tới giờ check-in
  | 'checkin_open' // đang trong cửa sổ check-in
  | 'in_use' // đã check-in, chưa hết giờ
  | 'over' // đã kết thúc / huỷ / no-show

export function bookingPhase(b: Booking, now: number): BookingPhase {
  if (b.status === 'checked_in') return now < endsAt(b) ? 'in_use' : 'over'
  if (b.status !== 'confirmed') return 'over'
  if (now < checkinOpensAt(b)) return 'upcoming'
  if (now <= checkinClosesAt(b)) return 'checkin_open'
  return 'over'
}
