// Mọi lịch đặt phòng tính theo giờ campus (Việt Nam, UTC+7, không có giờ mùa
// hè) — không phụ thuộc múi giờ của điện thoại hay của máy chạy server.

export const CAMPUS_UTC_OFFSET_MINUTES = 7 * 60
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

function shifted(epochMs: number): Date {
  return new Date(epochMs + CAMPUS_UTC_OFFSET_MINUTES * MINUTE_MS)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Ngày hiện tại theo giờ campus, dạng YYYY-MM-DD */
export function campusDate(now: number = Date.now()): string {
  return isoDate(shifted(now))
}

/** Số phút đã trôi qua kể từ 00:00 giờ campus (có phần lẻ) */
export function campusMinute(now: number = Date.now()): number {
  const d = shifted(now)
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60
}

/** Đổi (ngày campus, phút trong ngày) sang epoch milliseconds */
export function toEpoch(date: string, minute: number): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) + (minute - CAMPUS_UTC_OFFSET_MINUTES) * MINUTE_MS
}

export function addDays(date: string, days: number): string {
  return isoDate(new Date(toEpoch(date, CAMPUS_UTC_OFFSET_MINUTES) + days * DAY_MS))
}

/** Số ngày từ `from` tới `to` (âm nếu `to` ở trước) */
export function daysBetween(from: string, to: string): number {
  return Math.round((toEpoch(to, 0) - toEpoch(from, 0)) / DAY_MS)
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date
}

/** 450 -> "07:30" */
export function formatMinute(minute: number): string {
  const m = Math.round(minute)
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** 540, 630 -> "09:00–10:30" */
export function formatRange(start: number, end: number): string {
  return `${formatMinute(start)}–${formatMinute(end)}`
}

/** 90 -> "1 giờ 30 phút" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} phút`
  if (rest === 0) return `${h} giờ`
  return `${h} giờ ${rest} phút`
}

/** Thứ trong tuần: 0 = Chủ nhật … 6 = Thứ bảy */
export function weekday(date: string): number {
  return new Date(toEpoch(date, CAMPUS_UTC_OFFSET_MINUTES)).getUTCDay()
}

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const WEEKDAY_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[weekday(date)]
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10))
}

/** "Hôm nay", "Ngày mai" hoặc "Thứ tư, 08/10" */
export function dayLabel(date: string, today: string): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Ngày mai'
  if (diff === -1) return 'Hôm qua'
  return `${WEEKDAY_LONG[weekday(date)]}, ${date.slice(8, 10)}/${date.slice(5, 7)}`
}
