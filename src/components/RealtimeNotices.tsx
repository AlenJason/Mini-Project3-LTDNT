import { useEffect, useRef } from 'react'
import { bookingPhase, CHECKIN_GRACE_MINUTES } from '../../shared/rules.ts'
import { formatRange } from '../../shared/time.ts'
import { useToast } from '../context/ToastContext.tsx'
import { useNow } from '../hooks/useNow.ts'
import { useRealtime } from '../hooks/useRealtime.ts'
import { errorFeedback } from '../services/haptics.ts'
import { syncReminders } from '../services/notifications.ts'
import { onRealtimeEvent } from '../store/realtime.ts'

/**
 * Không render gì — chỉ lắng nghe:
 * - Thông báo từ server (ví dụ lịch bị tự huỷ vì không check-in) -> toast.
 * - Lịch của tôi vừa mở check-in -> toast nhắc (khi app đang mở).
 * - Danh sách lịch thay đổi -> đồng bộ thông báo cục bộ trên điện thoại.
 */
export function RealtimeNotices() {
  const toast = useToast()
  const mine = useRealtime((s) => s.mine)
  const now = useNow(15_000)
  const reminded = useRef(new Set<string>())

  useEffect(
    () =>
      onRealtimeEvent((e) => {
        if (e.type !== 'notice') return
        if (e.notice.kind === 'no_show') errorFeedback()
        toast(e.notice.message, e.notice.kind === 'no_show' ? 'error' : 'info')
      }),
    [toast],
  )

  useEffect(() => {
    if (mine) void syncReminders(mine)
  }, [mine])

  useEffect(() => {
    for (const b of mine ?? []) {
      if (bookingPhase(b, now) !== 'checkin_open' || reminded.current.has(b.id)) continue
      reminded.current.add(b.id)
      toast(
        `Đã mở check-in ${b.roomId} (${formatRange(b.start, b.end)}). Check-in trong ${CHECKIN_GRACE_MINUTES} phút đầu ở tab Lịch của tôi.`,
        'info',
      )
    }
  }, [mine, now, toast])

  return null
}
