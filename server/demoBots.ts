// "Sinh viên ảo" để thấy hiệu ứng realtime khi chỉ có một mình bạn test:
// - Tự check-in đúng hạn (trừ một người "hay quên" -> minh hoạ tự nhả phòng).
// - Thỉnh thoảng giữ chỗ vài giây rồi đặt một khung giờ, hoặc huỷ một lịch.
// Chỉ hoạt động khi đang có người mở app. Tắt bằng biến môi trường DEMO_BOTS=off.

import { SLOT_MINUTES, bookingPhase, currentSlotStart } from '../shared/rules.ts'
import { addDays, campusDate, campusMinute } from '../shared/time.ts'
import type { BookingService } from './bookingService.ts'
import type { BookingEngine } from './engine.ts'
import { DEMO_USERS, FORGETFUL_USER_ID, isDemoUser } from './seed.ts'

/** Số lịch demo tối đa mỗi ngày — tránh làm state phình to khi app mở lâu */
const MAX_DEMO_BOOKINGS_PER_DAY = 20

const PURPOSES = [
  'Học nhóm',
  'Ôn thi giữa kỳ',
  'Làm đồ án',
  'Họp nhóm môn Lập trình di động',
  'Chuẩn bị thuyết trình',
  'Luyện đề TOEIC',
]

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function startDemoBots(engine: BookingEngine, isActive: () => boolean, activityEveryMs = 40_000): () => void {
  const quietly = (op: (s: BookingService) => void) => engine.run(op).catch(() => {})

  const checkInTimer = setInterval(() => {
    if (!isActive()) return
    void quietly((s) => {
      const now = Date.now()
      for (const b of s.allBookings()) {
        if (!isDemoUser(b.userId) || b.userId === FORGETFUL_USER_ID) continue
        if (bookingPhase(b, now) === 'checkin_open') s.checkIn({ id: b.userId, name: b.userName }, b.id)
      }
    })
  }, 15_000)

  const activityTimer = setInterval(() => {
    if (!isActive()) return
    if (Math.random() < 0.25) void quietly(cancelRandom)
    else bookRandom(engine)
  }, activityEveryMs)

  return () => {
    clearInterval(checkInTimer)
    clearInterval(activityTimer)
  }
}

function bookRandom(engine: BookingEngine) {
  const now = Date.now()
  const user = pick(DEMO_USERS)
  const room = pick(engine.roomList)
  const nowSlot = currentSlotStart(campusMinute(now))
  const lateToday = nowSlot + 2 * SLOT_MINUTES >= room.closeMinute
  const date = lateToday ? addDays(campusDate(now), 1) : campusDate(now)
  const from = lateToday ? room.openMinute : Math.max(room.openMinute, nowSlot + SLOT_MINUTES)
  const start = from + SLOT_MINUTES * Math.floor(Math.random() * 8)
  const end = Math.min(room.closeMinute, start + SLOT_MINUTES * (1 + Math.floor(Math.random() * 3)))
  if (start >= end) return

  const req = { roomId: room.id, date, start, end }
  engine
    .run((s) => {
      const demoToday = s.allBookings().filter((b) => b.date === date && isDemoUser(b.userId)).length
      if (demoToday >= MAX_DEMO_BOOKINGS_PER_DAY) return { ok: false } as const
      return s.createHold(user, req, `bot:${user.id}`)
    })
    .then((hold) => {
      if (!hold.ok) return
      // Giữ chỗ vài giây như người thật đang điền form, rồi mới đặt
      setTimeout(
        () => {
          engine
            .run((s) =>
              s.createBooking(user, {
                ...req,
                purpose: pick(PURPOSES),
                attendees: 1 + Math.floor(Math.random() * Math.min(room.capacity, 6)),
              }),
            )
            .catch(() => {})
        },
        6_000 + Math.random() * 6_000,
      )
    })
    .catch(() => {})
}

function cancelRandom(s: BookingService) {
  const now = Date.now()
  const candidates = s.allBookings().filter((b) => isDemoUser(b.userId) && bookingPhase(b, now) === 'upcoming')
  if (candidates.length === 0) return
  const b = pick(candidates)
  s.cancel({ id: b.userId, name: b.userName }, b.id)
}
