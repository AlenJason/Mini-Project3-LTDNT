import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDays,
  campusDate,
  campusMinute,
  dayLabel,
  daysBetween,
  formatDuration,
  formatRange,
  isValidDate,
  toEpoch,
  weekdayShort,
} from './time.ts'

describe('giờ campus (UTC+7)', () => {
  it('toEpoch và campusDate/campusMinute là nghịch đảo của nhau', () => {
    const t = toEpoch('2026-10-05', 9 * 60 + 30)
    assert.equal(new Date(t).toISOString(), '2026-10-05T02:30:00.000Z')
    assert.equal(campusDate(t), '2026-10-05')
    assert.equal(campusMinute(t), 570)
  })

  it('23:30 UTC đã là ngày hôm sau ở campus', () => {
    const t = Date.UTC(2026, 9, 5, 23, 30)
    assert.equal(campusDate(t), '2026-10-06')
    assert.equal(campusMinute(t), 6 * 60 + 30)
  })

  it('addDays / daysBetween qua ranh giới tháng và năm', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01')
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
    assert.equal(daysBetween('2026-10-05', '2026-10-12'), 7)
    assert.equal(daysBetween('2026-10-05', '2026-10-04'), -1)
  })

  it('isValidDate loại ngày không tồn tại', () => {
    assert.equal(isValidDate('2026-10-05'), true)
    assert.equal(isValidDate('2026-02-30'), false)
    assert.equal(isValidDate('05/10/2026'), false)
  })

  it('định dạng giờ và nhãn ngày', () => {
    assert.equal(formatRange(450, 540), '07:30–09:00')
    assert.equal(formatDuration(90), '1 giờ 30 phút')
    assert.equal(formatDuration(120), '2 giờ')
    assert.equal(weekdayShort('2026-10-05'), 'T2')
    assert.equal(dayLabel('2026-10-05', '2026-10-05'), 'Hôm nay')
    assert.equal(dayLabel('2026-10-06', '2026-10-05'), 'Ngày mai')
    assert.equal(dayLabel('2026-10-08', '2026-10-05'), 'Thứ năm, 08/10')
  })
})
