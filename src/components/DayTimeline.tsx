import type { CSSProperties } from 'react'
import type { Booking, Hold, Room } from '../../shared/types.ts'
import { AXIS_END, AXIS_START } from '../lib/rooms.ts'

const FLASH_MS = 2_500

function pct(minute: number): number {
  const clamped = Math.min(AXIS_END, Math.max(AXIS_START, minute))
  return ((clamped - AXIS_START) / (AXIS_END - AXIS_START)) * 100
}

function span(start: number, end: number): CSSProperties {
  return { left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }
}

interface Props {
  room: Room
  bookings: Booking[]
  holds: Hold[]
  myId?: string
  /** Phút hiện tại nếu đang xem hôm nay, null nếu ngày khác */
  nowMinute: number | null
  changed: Record<string, number>
  /** Thời điểm render (epoch ms) — để biết ô nào vừa đổi */
  now: number
}

/** Dải lịch trong ngày của một phòng, trên trục chung 07:00–21:00. */
export function DayTimeline({ room, bookings, holds, myId, nowMinute, changed, now }: Props) {
  const flash = (id: string) => ((changed[id] ?? 0) > now - FLASH_MS ? ' is-flash' : '')

  return (
    <div className="timeline" aria-hidden>
      {room.openMinute > AXIS_START && <span className="timeline__closed" style={span(AXIS_START, room.openMinute)} />}
      {room.closeMinute < AXIS_END && <span className="timeline__closed" style={span(room.closeMinute, AXIS_END)} />}
      {nowMinute !== null && <span className="timeline__past" style={span(AXIS_START, nowMinute)} />}
      {bookings.map((b) => (
        <span
          key={b.id}
          className={`timeline__seg ${b.userId === myId ? 'timeline__seg--mine' : 'timeline__seg--taken'}${flash(b.id)}`}
          style={span(b.start, b.end)}
        />
      ))}
      {holds
        .filter((h) => h.userId !== myId)
        .map((h) => (
          <span key={h.id} className={`timeline__seg timeline__seg--held${flash(h.id)}`} style={span(h.start, h.end)} />
        ))}
      {nowMinute !== null && nowMinute >= AXIS_START && nowMinute <= AXIS_END && (
        <span className="timeline__now" style={{ left: `${pct(nowMinute)}%` }} />
      )}
    </div>
  )
}

/** Nhãn giờ cho trục chung, đặt một lần phía trên danh sách phòng. */
export function TimelineAxis() {
  const hours = [7, 9, 11, 13, 15, 17, 19, 21]
  return (
    <div className="axis" aria-hidden>
      {hours.map((hour) => (
        <span key={hour} className="axis__tick" style={{ left: `${pct(hour * 60)}%` }}>
          {hour}h
        </span>
      ))}
    </div>
  )
}
