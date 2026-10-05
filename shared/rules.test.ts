import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bookingPhase, validateSlot } from './rules.ts'
import { toEpoch } from './time.ts'
import type { Booking, Room } from './types.ts'

const room: Room = {
  id: 'TV-201',
  name: 'Phòng học nhóm 1',
  type: 'study',
  building: 'Thư viện',
  floor: 2,
  capacity: 6,
  amenities: [],
  openMinute: 7 * 60,
  closeMinute: 21 * 60,
  description: '',
}

// 09:47 thứ hai 05/10/2026 (giờ campus)
const now = toEpoch('2026-10-05', 9 * 60 + 47)
const slot = (date: string, start: number, end: number) => ({ roomId: room.id, date, start, end })

describe('validateSlot', () => {
  it('chấp nhận khung giờ hợp lệ, kể cả khung đang diễn ra', () => {
    assert.equal(validateSlot(slot('2026-10-05', 600, 660), room, now), null)
    assert.equal(validateSlot(slot('2026-10-05', 570, 600), room, now), null)
  })

  it('từ chối khung đã qua', () => {
    assert.equal(validateSlot(slot('2026-10-05', 540, 570), room, now), 'IN_PAST')
    assert.equal(validateSlot(slot('2026-10-04', 600, 630), room, now), 'IN_PAST')
  })

  it('từ chối khung không chia hết 30 phút', () => {
    assert.equal(validateSlot(slot('2026-10-05', 615, 660), room, now), 'MISALIGNED')
  })

  it('từ chối ngoài giờ mở cửa', () => {
    assert.equal(validateSlot(slot('2026-10-06', 390, 450), room, now), 'OUTSIDE_HOURS')
    assert.equal(validateSlot(slot('2026-10-06', 1230, 1290), room, now), 'OUTSIDE_HOURS')
  })

  it('giới hạn 2 giờ mỗi lượt', () => {
    assert.equal(validateSlot(slot('2026-10-06', 600, 720), room, now), null)
    assert.equal(validateSlot(slot('2026-10-06', 600, 750), room, now), 'TOO_LONG')
  })

  it('chỉ đặt trước tối đa 7 ngày', () => {
    assert.equal(validateSlot(slot('2026-10-11', 600, 630), room, now), null)
    assert.equal(validateSlot(slot('2026-10-12', 600, 630), room, now), 'TOO_FAR_AHEAD')
  })

  it('từ chối dữ liệu rác từ client', () => {
    assert.equal(validateSlot(slot('2026-10-06', 660, 600), room, now), 'INVALID_INPUT')
    assert.equal(validateSlot(slot('ngày mai', 600, 630), room, now), 'INVALID_INPUT')
    assert.equal(validateSlot({ ...slot('2026-10-06', 600, 630), start: '600' as unknown as number }, room, now), 'INVALID_INPUT')
  })
})

describe('bookingPhase', () => {
  const booking = {
    date: '2026-10-05',
    start: 600,
    end: 660,
    status: 'confirmed',
  } as Booking

  it('mở check-in từ 10 phút trước tới 15 phút sau giờ bắt đầu', () => {
    assert.equal(bookingPhase(booking, toEpoch('2026-10-05', 589)), 'upcoming')
    assert.equal(bookingPhase(booking, toEpoch('2026-10-05', 590)), 'checkin_open')
    assert.equal(bookingPhase(booking, toEpoch('2026-10-05', 615)), 'checkin_open')
    assert.equal(bookingPhase(booking, toEpoch('2026-10-05', 616)), 'over')
  })

  it('lịch đã check-in đang dùng cho tới giờ kết thúc', () => {
    const inUse = { ...booking, status: 'checked_in' } as Booking
    assert.equal(bookingPhase(inUse, toEpoch('2026-10-05', 659)), 'in_use')
    assert.equal(bookingPhase(inUse, toEpoch('2026-10-05', 660)), 'over')
  })
})
