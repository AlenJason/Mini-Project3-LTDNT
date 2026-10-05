import { useRealtime } from '../hooks/useRealtime.ts'

const LABELS = {
  idle: 'Đang khởi động',
  connecting: 'Đang kết nối',
  online: 'Trực tiếp',
  offline: 'Mất kết nối',
}

/** Chấm trạng thái kết nối realtime ở góc phải header. */
export function LiveIndicator() {
  const status = useRealtime((s) => s.status)
  const online = useRealtime((s) => s.online)
  const title = status === 'online' ? `${online} thiết bị đang kết nối` : LABELS[status]
  return (
    <span className={`live live--${status}`} title={title}>
      <span className="live__dot" aria-hidden />
      {LABELS[status]}
    </span>
  )
}
