import { useEffect, useState, type FormEvent } from 'react'
import { Bell, LogOut, MonitorSmartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  BOOKING_WINDOW_DAYS,
  CHECKIN_GRACE_MINUTES,
  CHECKIN_OPENS_BEFORE_MINUTES,
  HOLD_TTL_MS,
  MAX_ACTIVE_BOOKINGS,
  MAX_BOOKING_MINUTES,
  SLOT_MINUTES,
} from '../../shared/rules.ts'
import { AppHeader } from '../components/AppHeader.tsx'
import { useSession } from '../context/SessionContext.tsx'
import { useToast } from '../context/ToastContext.tsx'
import { useRealtime } from '../hooks/useRealtime.ts'
import { defaultServerUrl, normalizeServerUrl } from '../services/config.ts'
import {
  notificationPermission,
  requestNotificationPermission,
  syncReminders,
  type NotificationPermission,
} from '../services/notifications.ts'
import { getState } from '../store/realtime.ts'

const RULES = [
  `Mỗi lượt đặt từ ${SLOT_MINUTES} phút tới ${MAX_BOOKING_MINUTES / 60} giờ, theo khung ${SLOT_MINUTES} phút.`,
  `Đặt trước tối đa ${BOOKING_WINDOW_DAYS} ngày, giữ tối đa ${MAX_ACTIVE_BOOKINGS} lịch chưa sử dụng.`,
  `Khi chọn giờ, khung đó được giữ riêng cho bạn trong ${HOLD_TTL_MS / 60_000} phút để điền thông tin.`,
  `Check-in mở trước giờ bắt đầu ${CHECKIN_OPENS_BEFORE_MINUTES} phút. Quá ${CHECKIN_GRACE_MINUTES} phút đầu chưa check-in, phòng tự được nhả cho người khác.`,
  'Xong việc sớm thì bấm "Trả phòng sớm" để người khác dùng tiếp.',
]

const PERMISSION_TEXT: Record<NotificationPermission, string> = {
  granted: 'Đã bật. Bạn sẽ được nhắc lúc mở check-in và 5 phút trước khi hết hạn.',
  denied: 'Đang tắt. Bật lại trong Cài đặt của điện thoại để nhận nhắc lịch.',
  prompt: 'Chưa bật. Bật để được nhắc check-in, tránh bị nhả phòng.',
  unsupported: 'Trên trình duyệt, nhắc lịch hiện ngay trong app khi app đang mở.',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function ProfilePage() {
  const { user, serverUrl, changeServerUrl, logout } = useSession()
  const status = useRealtime((s) => s.status)
  const online = useRealtime((s) => s.online)
  const rooms = useRealtime((s) => s.rooms)
  const [permission, setPermission] = useState<NotificationPermission>('unsupported')

  useEffect(() => {
    void notificationPermission().then(setPermission)
  }, [])

  async function enableNotifications() {
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') await syncReminders(getState().mine ?? [])
  }

  if (!user) return null

  return (
    <>
      <AppHeader title="Cá nhân" />
      <main className="page page--profile">
        <section className="profile">
          <span className="profile__avatar" aria-hidden>
            {initials(user.name)}
          </span>
          <div>
            <p className="profile__name">{user.name}</p>
            <p className="profile__id">MSSV {user.id}</p>
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">Quy định đặt phòng</h2>
          <ul className="rules">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <section className="section">
          <h2 className="section__title">Nhắc lịch</h2>
          <p className="section__text">{PERMISSION_TEXT[permission]}</p>
          {permission === 'prompt' && (
            <button type="button" className="button" onClick={enableNotifications}>
              <Bell size={16} aria-hidden /> Bật nhắc lịch
            </button>
          )}
        </section>

        <section className="section">
          <h2 className="section__title">Máy chủ realtime</h2>
          <p className="section__text">
            {status === 'online'
              ? `Đã kết nối. ${online} thiết bị đang mở app.`
              : status === 'offline'
                ? 'Chưa kết nối được. Kiểm tra server đã chạy và điện thoại cùng mạng với máy tính.'
                : 'Đang kết nối…'}
          </p>
          {/* key: đổi server ở nơi khác thì ô nhập lấy lại giá trị mới */}
          <ServerUrlForm key={serverUrl} serverUrl={serverUrl} onSave={changeServerUrl} />
          <button type="button" className="link-button" onClick={() => changeServerUrl(null)}>
            Dùng địa chỉ mặc định ({defaultServerUrl()})
          </button>
        </section>

        {rooms && (
          <section className="section">
            <h2 className="section__title">Màn hình trước cửa phòng</h2>
            <p className="section__text">
              Mở trên máy tính bảng đặt cạnh cửa để mọi người thấy phòng đang trống hay đang dùng.
            </p>
            <ul className="displaylinks">
              {rooms.map((r) => (
                <li key={r.id}>
                  <Link to={`/display/${r.id}`}>
                    <MonitorSmartphone size={15} aria-hidden /> <span className="plate">{r.id}</span> {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button type="button" className="button button--ghost button--block" onClick={logout}>
          <LogOut size={16} aria-hidden /> Đăng xuất
        </button>
      </main>
    </>
  )
}

function ServerUrlForm({ serverUrl, onSave }: { serverUrl: string; onSave: (url: string | null) => Promise<void> }) {
  const toast = useToast()
  const [value, setValue] = useState(serverUrl)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const url = normalizeServerUrl(value)
    if (!url) return toast('Địa chỉ máy chủ không hợp lệ. Ví dụ: http://192.168.1.10:4000', 'error')
    await onSave(url === defaultServerUrl() ? null : url)
    toast(`Đang kết nối tới ${url}`, 'info')
  }

  return (
    <form className="urlform" onSubmit={submit}>
      <input
        className="input input--code"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Địa chỉ máy chủ realtime"
      />
      <button type="submit" className="button">
        Lưu
      </button>
    </form>
  )
}
