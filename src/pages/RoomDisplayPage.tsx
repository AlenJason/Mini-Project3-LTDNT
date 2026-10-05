import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CHECKIN_GRACE_MINUTES, isBlocking } from '../../shared/rules.ts'
import { campusDate, campusMinute, formatMinute, formatRange } from '../../shared/time.ts'
import { useNow } from '../hooks/useNow.ts'
import { useDay, useRealtime } from '../hooks/useRealtime.ts'
import { roomLocation, roomStatusNow, shortName } from '../lib/rooms.ts'

const STATE_TITLES = {
  free: 'Trống',
  busy: 'Đang sử dụng',
  held: 'Có người đang giữ chỗ',
  closed: 'Đóng cửa',
}

/**
 * Màn hình đặt trước cửa phòng (kiểu Robin Room Display): cho biết phòng
 * đang trống hay đang dùng, ai đang dùng và lịch tiếp theo — cập nhật realtime.
 * Không cần đăng nhập.
 */
export function RoomDisplayPage() {
  const { roomId = '' } = useParams()
  const now = useNow(5_000)
  const today = campusDate(now)
  const nowMinute = campusMinute(now)
  const rooms = useRealtime((s) => s.rooms)
  const status = useRealtime((s) => s.status)
  const day = useDay(today)
  const room = rooms?.find((r) => r.id === roomId)

  const bookings = useMemo(
    () =>
      day
        ? Object.values(day.bookings)
            .filter((b) => b.roomId === roomId && isBlocking(b))
            .sort((a, b) => a.start - b.start)
        : [],
    [day, roomId],
  )
  const holds = useMemo(
    () => (day ? Object.values(day.holds).filter((h) => h.roomId === roomId && h.expiresAt > now) : []),
    [day, roomId, now],
  )

  if (!room) {
    return (
      <main className="display display--closed">
        <p className="display__state">{rooms ? `Không có phòng ${roomId}` : 'Đang tải…'}</p>
        <Link to="/" className="display__exit">
          Về app
        </Link>
      </main>
    )
  }

  const state = roomStatusNow(room, bookings, holds, nowMinute)
  const current = bookings.find((b) => b.start <= nowMinute && nowMinute < b.end)
  const upNext = bookings.filter((b) => b.start > nowMinute).slice(0, 4)

  return (
    <main className={`display display--${state.kind}`}>
      <header className="display__head">
        <div>
          <p className="display__code">{room.id}</p>
          <p className="display__name">
            {room.name}, {roomLocation(room)}
          </p>
        </div>
        <p className="display__clock">{formatMinute(Math.floor(nowMinute))}</p>
      </header>

      <section className="display__now" aria-live="polite">
        <p className="display__state">{STATE_TITLES[state.kind]}</p>
        <p className="display__detail">
          {state.kind === 'held'
            ? 'Một bạn đang điền thông tin đặt phòng.'
            : state.until !== undefined
              ? `tới ${formatMinute(state.until)}`
              : state.label}
        </p>
        {current && (
          <p className="display__who">
            {shortName(current.userName)}, {current.purpose}, {formatRange(current.start, current.end)}.{' '}
            {current.status === 'checked_in'
              ? 'Đã check-in.'
              : `Chưa check-in, phòng tự nhả lúc ${formatMinute(current.start + CHECKIN_GRACE_MINUTES)}.`}
          </p>
        )}
      </section>

      <section className="display__next">
        <h2 className="display__next-title">Tiếp theo hôm nay</h2>
        {upNext.length === 0 ? (
          <p className="display__empty">Không còn lịch nào. Đặt phòng này trên app Đặt Phòng VKU.</p>
        ) : (
          <ol className="display__list">
            {upNext.map((b) => (
              <li key={b.id}>
                <strong>{formatRange(b.start, b.end)}</strong>
                <span>
                  {shortName(b.userName)}, {b.purpose}
                  {b.status === 'checked_in' && ' (đã check-in)'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="display__foot">
        <span>{status === 'online' ? 'Đang cập nhật trực tiếp' : 'Mất kết nối, đang thử lại…'}</span>
        <Link to={`/rooms/${room.id}`} className="display__exit">
          Thoát màn hình phòng
        </Link>
      </footer>
    </main>
  )
}
