import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '../hooks/useNetworkStatus.ts'
import { useRealtime } from '../hooks/useRealtime.ts'
import { reconnectNow } from '../store/realtime.ts'

/** Mất kết nối ngắn hơn mức này thì không báo (kết nối lại định kỳ trên Vercel) */
const SERVER_BANNER_DELAY_MS = 3_000

/** Báo khi mất mạng hoặc không tới được server realtime. */
export function ConnectionBanner() {
  const networkUp = useNetworkStatus()
  const status = useRealtime((s) => s.status)

  if (!networkUp) {
    return (
      <div className="banner banner--offline" role="status">
        <WifiOff size={16} aria-hidden />
        <p>Bạn đang offline. Lịch hiển thị có thể đã cũ và chưa đặt được phòng cho tới khi có mạng.</p>
      </div>
    )
  }
  // Mount lại mỗi lần mất kết nối -> bộ đếm 3 giây bắt đầu lại từ đầu
  return status === 'offline' ? <ServerUnreachable /> : null
}

function ServerUnreachable() {
  const serverUrl = useRealtime((s) => s.serverUrl)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SERVER_BANNER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null
  return (
    <div className="banner banner--server" role="status">
      <RefreshCw size={16} aria-hidden />
      <p>
        Không kết nối được máy chủ <span className="banner__url">{serverUrl}</span>. Đang thử lại…
      </p>
      <button type="button" className="banner__action" onClick={reconnectNow}>
        Thử ngay
      </button>
    </div>
  )
}
