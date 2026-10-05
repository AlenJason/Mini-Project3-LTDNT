import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { HOLD_TTL_MS } from '../shared/rules.ts'
import { toEpoch } from '../shared/time.ts'
import type { BookingRequest, User } from '../shared/types.ts'
import { BookingService, type ServiceEvent } from './bookingService.ts'
import { ROOMS } from './seed.ts'

const TODAY = '2026-10-05'
const an: User = { id: '23IT001', name: 'Nguyễn Văn An' }
const binh: User = { id: '23IT002', name: 'Trần Thị Bình' }

const request = (patch: Partial<BookingRequest> = {}): BookingRequest => ({
  roomId: 'TV-201',
  date: TODAY,
  start: 10 * 60,
  end: 11 * 60,
  purpose: 'Học nhóm',
  attendees: 4,
  ...patch,
})

let now: number
let service: BookingService
let events: ServiceEvent[]

beforeEach(() => {
  now = toEpoch(TODAY, 8 * 60)
  service = new BookingService(ROOMS, undefined, () => now)
  events = []
  service.subscribe((e) => events.push(e))
})

describe('đặt phòng', () => {
  it('đặt thành công và phát sự kiện booking', () => {
    const result = service.createBooking(an, request())
    assert.ok(result.ok)
    assert.equal(result.data.status, 'confirmed')
    assert.deepEqual(
      events.map((e) => e.type),
      ['booking'],
    )
  })

  it('không bao giờ có hai lịch trùng giờ trong cùng một phòng', () => {
    assert.ok(service.createBooking(an, request()).ok)
    const second = service.createBooking(binh, request({ start: 10 * 60 + 30, end: 12 * 60 }))
    assert.equal(second.ok, false)
    assert.equal(!second.ok && second.error.code, 'SLOT_TAKEN')
    // Liền kề thì được
    assert.ok(service.createBooking(binh, request({ start: 11 * 60, end: 12 * 60 })).ok)
  })

  it('lịch đã huỷ không còn chiếm chỗ', () => {
    const first = service.createBooking(an, request())
    assert.ok(first.ok)
    assert.ok(service.cancel(an, first.data.id).ok)
    assert.ok(service.createBooking(binh, request()).ok)
  })

  it('không cho một người đặt hai phòng trùng giờ', () => {
    assert.ok(service.createBooking(an, request()).ok)
    const other = service.createBooking(an, request({ roomId: 'TV-202', attendees: 2 }))
    assert.equal(!other.ok && other.error.code, 'SELF_OVERLAP')
  })

  it('giới hạn 3 lịch chưa sử dụng mỗi người', () => {
    for (const start of [600, 720, 840]) {
      assert.ok(service.createBooking(an, request({ start, end: start + 60 })).ok)
    }
    const fourth = service.createBooking(an, request({ start: 960, end: 1020 }))
    assert.equal(!fourth.ok && fourth.error.code, 'LIMIT_REACHED')
  })

  it('từ chối số người vượt sức chứa', () => {
    const result = service.createBooking(an, request({ attendees: 7 }))
    assert.equal(!result.ok && result.error.code, 'OVER_CAPACITY')
  })

  it('chỉ chủ lịch mới huỷ được', () => {
    const booking = service.createBooking(an, request())
    assert.ok(booking.ok)
    const result = service.cancel(binh, booking.data.id)
    assert.equal(!result.ok && result.error.code, 'FORBIDDEN')
  })
})

describe('giữ chỗ tạm thời', () => {
  it('người khác không giữ hoặc đặt được khung đang bị giữ', () => {
    assert.ok(service.createHold(an, request(), 'socket-an').ok)
    const hold = service.createHold(binh, request({ start: 630, end: 690 }), 'socket-binh')
    assert.equal(!hold.ok && hold.error.code, 'SLOT_HELD')
    const booking = service.createBooking(binh, request())
    assert.equal(!booking.ok && booking.error.code, 'SLOT_HELD')
  })

  it('người giữ chỗ đặt được và hold được nhả', () => {
    assert.ok(service.createHold(an, request(), 'socket-an').ok)
    assert.ok(service.createBooking(an, request()).ok)
    assert.equal(service.activeHolds().length, 0)
    const removed = events.find((e) => e.type === 'hold_removed')
    assert.equal(removed?.type === 'hold_removed' && removed.removed.reason, 'booked')
  })

  it('mỗi người chỉ giữ một khung — giữ khung mới thay khung cũ', () => {
    assert.ok(service.createHold(an, request(), 's1').ok)
    assert.ok(service.createHold(an, request({ start: 720, end: 780 }), 's1').ok)
    assert.equal(service.activeHolds().length, 1)
    assert.ok(service.createHold(binh, request(), 's2').ok)
  })

  it('hold hết hạn sau 2 phút', () => {
    assert.ok(service.createHold(an, request(), 's1').ok)
    now += HOLD_TTL_MS
    service.sweep()
    assert.equal(service.activeHolds().length, 0)
    assert.ok(service.createBooking(binh, request()).ok)
  })

  it('mất kết nối thì nhả hold của socket đó', () => {
    assert.ok(service.createHold(an, request(), 's1').ok)
    service.releaseHoldsByOwner('s1')
    assert.equal(service.activeHolds().length, 0)
  })
})

describe('check-in và tự nhả phòng', () => {
  it('check-in chỉ mở từ 10 phút trước giờ bắt đầu', () => {
    const booking = service.createBooking(an, request())
    assert.ok(booking.ok)
    now = toEpoch(TODAY, 10 * 60 - 11)
    const early = service.checkIn(an, booking.data.id)
    assert.equal(!early.ok && early.error.code, 'CHECKIN_TOO_EARLY')
    now = toEpoch(TODAY, 10 * 60 - 10)
    const result = service.checkIn(an, booking.data.id)
    assert.ok(result.ok)
    assert.equal(result.data.status, 'checked_in')
  })

  it('không check-in trong 15 phút đầu thì tự nhả phòng và báo cho người đặt', () => {
    const booking = service.createBooking(an, request())
    assert.ok(booking.ok)
    now = toEpoch(TODAY, 10 * 60 + 15)
    service.sweep()
    assert.equal(service.getBooking(booking.data.id)?.status, 'confirmed')

    now = toEpoch(TODAY, 10 * 60 + 16)
    service.sweep()
    assert.equal(service.getBooking(booking.data.id)?.status, 'no_show')
    const notice = events.find((e) => e.type === 'notice')
    assert.equal(notice?.type === 'notice' && notice.userId, an.id)
    // Khung còn lại (10:30–11:00) đặt được ngay
    assert.ok(service.createBooking(binh, request({ start: 630, end: 660 })).ok)
  })

  it('kết thúc sớm nhả các khung còn lại', () => {
    const booking = service.createBooking(an, request({ start: 600, end: 720 }))
    assert.ok(booking.ok)
    now = toEpoch(TODAY, 600)
    assert.ok(service.checkIn(an, booking.data.id).ok)

    now = toEpoch(TODAY, 625)
    const ended = service.endEarly(an, booking.data.id)
    assert.ok(ended.ok)
    assert.equal(ended.data.status, 'completed')
    assert.equal(ended.data.end, 630)
    assert.equal(ended.data.originalEnd, 720)
    assert.ok(service.createBooking(binh, request({ start: 630, end: 720 })).ok)
  })

  it('check-in sớm rồi trả phòng trước giờ bắt đầu thì nhả toàn bộ lịch', () => {
    const booking = service.createBooking(an, request())
    assert.ok(booking.ok)
    now = toEpoch(TODAY, 10 * 60 - 5)
    assert.ok(service.checkIn(an, booking.data.id).ok)
    const ended = service.endEarly(an, booking.data.id)
    assert.ok(ended.ok)
    assert.equal(ended.data.status, 'cancelled')
    assert.ok(service.createBooking(binh, request()).ok)
  })

  it('lịch đã check-in tự chuyển sang hoàn thành khi hết giờ', () => {
    const booking = service.createBooking(an, request())
    assert.ok(booking.ok)
    now = toEpoch(TODAY, 600)
    assert.ok(service.checkIn(an, booking.data.id).ok)
    now = toEpoch(TODAY, 660)
    service.sweep()
    assert.equal(service.getBooking(booking.data.id)?.status, 'completed')
  })
})
