import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import { CHECKIN_GRACE_MINUTES, checkinClosesAt, checkinOpensAt } from '../../shared/rules.ts'
import { formatMinute } from '../../shared/time.ts'
import type { Booking } from '../../shared/types.ts'

// Nhắc lịch bằng thông báo cục bộ (native). Hai nhắc cho mỗi lịch chưa check-in:
//  1. Lúc mở check-in (10 phút trước giờ bắt đầu)
//  2. 5 phút trước khi hết hạn check-in
// Trên web, nhắc lịch hiển thị trong app (xem hooks/useReminders.ts).

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

const native = Capacitor.isNativePlatform()
const DEADLINE_WARNING_MINUTES = 5

export async function notificationPermission(): Promise<NotificationPermission> {
  if (!native) return 'unsupported'
  try {
    const { display } = await LocalNotifications.checkPermissions()
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'unsupported'
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!native) return 'unsupported'
  try {
    const { display } = await LocalNotifications.requestPermissions()
    return display === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

/** Id thông báo phải là số nguyên 32-bit — băm id lịch đặt. */
function notificationId(bookingId: string, kind: 0 | 1): number {
  let hash = 5381
  for (let i = 0; i < bookingId.length; i++) hash = ((hash * 33) ^ bookingId.charCodeAt(i)) >>> 0
  return (hash % 500_000_000) * 2 + kind
}

function desiredNotifications(bookings: Booking[], now: number): LocalNotificationSchema[] {
  const result: LocalNotificationSchema[] = []
  for (const b of bookings) {
    if (b.status !== 'confirmed') continue
    const opensAt = checkinOpensAt(b)
    const warnAt = checkinClosesAt(b) - DEADLINE_WARNING_MINUTES * 60_000
    if (opensAt > now) {
      result.push({
        id: notificationId(b.id, 0),
        title: `Sắp đến giờ dùng phòng ${b.roomId}`,
        body: `Lịch ${formatMinute(b.start)}–${formatMinute(b.end)} đã mở check-in. Check-in trong ${CHECKIN_GRACE_MINUTES} phút đầu để giữ phòng.`,
        schedule: { at: new Date(opensAt), allowWhileIdle: true },
        extra: { bookingId: b.id },
      })
    }
    if (warnAt > now) {
      result.push({
        id: notificationId(b.id, 1),
        title: `Còn ${DEADLINE_WARNING_MINUTES} phút để check-in ${b.roomId}`,
        body: 'Không check-in thì phòng sẽ tự được nhả cho người khác.',
        schedule: { at: new Date(warnAt), allowWhileIdle: true },
        extra: { bookingId: b.id },
      })
    }
  }
  return result
}

/**
 * Đồng bộ thông báo đã lên lịch với danh sách lịch của tôi: huỷ nhắc của lịch
 * đã huỷ / đã check-in, thêm nhắc cho lịch mới.
 */
export async function syncReminders(bookings: Booking[]): Promise<void> {
  if (!native) return
  try {
    if ((await notificationPermission()) !== 'granted') return
    const desired = desiredNotifications(bookings, Date.now())
    const desiredIds = new Set(desired.map((n) => n.id))
    const { notifications: pending } = await LocalNotifications.getPending()
    const pendingIds = new Set(pending.map((n) => n.id))

    const stale = pending.filter((n) => n.extra?.bookingId && !desiredIds.has(n.id))
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) })
    }
    const fresh = desired.filter((n) => !pendingIds.has(n.id))
    if (fresh.length > 0) await LocalNotifications.schedule({ notifications: fresh })
  } catch (err) {
    console.warn('[notifications] Không đồng bộ được nhắc lịch', err)
  }
}
