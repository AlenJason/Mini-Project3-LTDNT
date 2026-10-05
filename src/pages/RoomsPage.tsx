import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { slotStarts } from '../../shared/rules.ts'
import { campusMinute, formatMinute } from '../../shared/time.ts'
import type { RoomType } from '../../shared/types.ts'
import { AppHeader } from '../components/AppHeader.tsx'
import { DateStrip } from '../components/DateStrip.tsx'
import { DayTimeline, TimelineAxis } from '../components/DayTimeline.tsx'
import { useSession } from '../context/SessionContext.tsx'
import { useDay, useRealtime } from '../hooks/useRealtime.ts'
import { useSelectedDate } from '../hooks/useSelectedDate.ts'
import { ROOM_TYPE_LABELS, freeSlotCount, roomLocation, roomStatusNow, type RoomNow } from '../lib/rooms.ts'
import { resync } from '../store/realtime.ts'

type Filter = RoomType | 'all'
const FILTERS: Filter[] = ['all', 'study', 'lab', 'seminar']

export function RoomsPage() {
  const { user } = useSession()
  const { date, setDate, today, now } = useSelectedDate()
  const rooms = useRealtime((s) => s.rooms)
  const roomsError = useRealtime((s) => s.roomsError)
  const day = useDay(date)
  const [filter, setFilter] = useState<Filter>('all')
  const [freeNowOnly, setFreeNowOnly] = useState(false)

  const isToday = date === today
  const nowMinute = isToday ? campusMinute(now) : null
  const bookings = useMemo(() => (day ? Object.values(day.bookings) : []), [day])
  const holds = useMemo(() => (day ? Object.values(day.holds).filter((h) => h.expiresAt > now) : []), [day, now])

  const rows = useMemo(() => {
    return (rooms ?? []).map((room) => {
      const roomBookings = bookings.filter((b) => b.roomId === room.id)
      const roomHolds = holds.filter((h) => h.roomId === room.id)
      let state: RoomNow
      if (nowMinute !== null) {
        state = roomStatusNow(room, roomBookings, roomHolds, nowMinute)
      } else {
        const free = freeSlotCount(room, slotStarts(room), roomBookings, roomHolds, 0)
        state = free > 0 ? { kind: 'free', label: `Còn ${free} khung trống` } : { kind: 'busy', label: 'Kín lịch' }
      }
      return { room, roomBookings, roomHolds, state }
    })
  }, [rooms, bookings, holds, nowMinute])

  const visible = rows.filter(
    (r) => (filter === 'all' || r.room.type === filter) && (!freeNowOnly || !isToday || r.state.kind === 'free'),
  )
  const freeNowCount = isToday ? rows.filter((r) => r.state.kind === 'free').length : null
  const allClosed = isToday && rows.length > 0 && rows.every((r) => r.state.kind === 'closed')
  const afterHours = allClosed && rooms !== null && (nowMinute ?? 0) >= Math.max(...rooms.map((r) => r.closeMinute))

  return (
    <>
      <AppHeader title="Đặt phòng">
        <DateStrip today={today} value={date} onChange={setDate} />
      </AppHeader>

      <main className="page">
        {freeNowCount !== null && rooms && (
          <p className="summary">
            {freeNowCount > 0
              ? `${freeNowCount} trên ${rooms.length} phòng đang trống lúc ${formatMinute(Math.floor(nowMinute ?? 0))}.`
              : afterHours
                ? 'Các phòng đã đóng cửa hôm nay. Chọn ngày khác để đặt trước.'
                : allClosed
                  ? 'Các phòng chưa mở cửa. Bạn vẫn đặt trước được các khung giờ hôm nay.'
                  : 'Hiện không còn phòng trống. Xem các khung giờ sau hoặc chọn ngày khác.'}
          </p>
        )}

        <div className="filters" role="group" aria-label="Lọc loại phòng">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${filter === f ? ' is-selected' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Tất cả' : ROOM_TYPE_LABELS[f]}
            </button>
          ))}
          {isToday && (
            <button
              type="button"
              className={`chip chip--toggle${freeNowOnly ? ' is-selected' : ''}`}
              aria-pressed={freeNowOnly}
              onClick={() => setFreeNowOnly((v) => !v)}
            >
              Trống bây giờ
            </button>
          )}
        </div>

        {!rooms && !roomsError && <p className="muted">Đang tải danh sách phòng…</p>}
        {!rooms && roomsError && (
          <div className="empty">
            <p>Chưa tải được danh sách phòng. Kiểm tra máy chủ realtime ở tab Cá nhân.</p>
            <button type="button" className="button" onClick={resync}>
              Tải lại
            </button>
          </div>
        )}

        {rooms && (
          <>
            <TimelineAxis />
            <ul className="roomlist">
              {visible.map(({ room, roomBookings, roomHolds, state }) => (
                <li key={room.id}>
                  <Link to={`/rooms/${room.id}?date=${date}`} className="roomrow">
                    <div className="roomrow__head">
                      <span className="plate">{room.id}</span>
                      <div className="roomrow__info">
                        <strong className="roomrow__name">{room.name}</strong>
                        <span className="roomrow__meta">
                          {roomLocation(room)}
                          <span className="roomrow__cap">
                            <Users size={13} aria-hidden /> {room.capacity}
                          </span>
                        </span>
                      </div>
                    </div>
                    <p className={`roomstate roomstate--${state.kind}`}>{state.label}</p>
                    <DayTimeline
                      room={room}
                      bookings={roomBookings}
                      holds={roomHolds}
                      myId={user?.id}
                      nowMinute={nowMinute}
                      changed={day?.changed ?? {}}
                      now={now}
                    />
                  </Link>
                </li>
              ))}
            </ul>
            {visible.length === 0 && (
              <div className="empty">
                <p>Không có phòng nào khớp bộ lọc lúc này.</p>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setFilter('all')
                    setFreeNowOnly(false)
                  }}
                >
                  Xem tất cả phòng
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
