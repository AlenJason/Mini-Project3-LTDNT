import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CHECKIN_GRACE_MINUTES,
  CHECKIN_OPENS_BEFORE_MINUTES,
  bookingPhase,
  checkinClosesAt,
  endsAt,
  startsAt,
} from '../../shared/rules.ts'
import { dayLabel, formatDuration, formatMinute, formatRange } from '../../shared/time.ts'
import type { Booking, BookingStatus, Room } from '../../shared/types.ts'
import { roomLocation } from '../lib/rooms.ts'

const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: 'Đã đặt',
  checked_in: 'Đang dùng',
  completed: 'Đã xong',
  cancelled: 'Đã huỷ',
  no_show: 'Tự huỷ vì không check-in',
}

export type BookingAction = 'checkin' | 'cancel' | 'end'

interface Props {
  booking: Booking
  room?: Room
  today: string
  now: number
  busy: BookingAction | null
  onAction: (action: BookingAction) => void
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function phaseText(b: Booking, now: number): string {
  switch (bookingPhase(b, now)) {
    case 'upcoming': {
      const minutes = (startsAt(b) - now) / 60_000
      if (minutes < 24 * 60) return `Bắt đầu sau ${formatDuration(Math.ceil(minutes))}. Mở check-in lúc ${formatMinute(b.start - CHECKIN_OPENS_BEFORE_MINUTES)}.`
      return `Mở check-in lúc ${formatMinute(b.start - CHECKIN_OPENS_BEFORE_MINUTES)}, ${CHECKIN_GRACE_MINUTES} phút đầu là hạn chót.`
    }
    case 'checkin_open':
      return `Check-in ngay — còn ${countdown(checkinClosesAt(b) - now)} trước khi phòng tự được nhả.`
    case 'in_use':
      return `Đang dùng, còn ${formatDuration(Math.ceil((endsAt(b) - now) / 60_000))}.`
    case 'over':
      if (b.status === 'completed' && b.originalEnd) return `Đã trả phòng sớm lúc ${formatMinute(b.end)}.`
      return ''
  }
}

export function BookingCard({ booking: b, room, today, now, busy, onAction }: Props) {
  const phase = bookingPhase(b, now)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  // Nút "Huỷ lịch" cần bấm hai lần; tự quay về sau vài giây
  useEffect(() => {
    if (!confirmingCancel) return
    const timer = setTimeout(() => setConfirmingCancel(false), 4_000)
    return () => clearTimeout(timer)
  }, [confirmingCancel])

  const canCancel = b.status === 'confirmed' && phase !== 'over'
  const text = phaseText(b, now)

  return (
    <article className={`booking booking--${b.status}${phase === 'checkin_open' ? ' is-urgent' : ''}`}>
      <div className="booking__top">
        <Link to={`/rooms/${b.roomId}?date=${b.date}`} className="plate plate--link">
          {b.roomId}
        </Link>
        <span className={`status status--${b.status}`}>{STATUS_LABELS[b.status]}</span>
      </div>
      {room && (
        <p className="booking__room">
          {room.name} — {roomLocation(room)}
        </p>
      )}
      <p className="booking__when">
        <span>{dayLabel(b.date, today)}</span>
        <strong>{formatRange(b.start, b.originalEnd ?? b.end)}</strong>
      </p>
      <p className="booking__purpose">
        {b.purpose}, {b.attendees} người
      </p>
      {text && <p className="booking__phase">{text}</p>}

      {(phase === 'checkin_open' || phase === 'in_use' || canCancel) && (
        <div className="booking__actions">
          {phase === 'checkin_open' && (
            <button
              type="button"
              className="button button--primary"
              disabled={busy !== null}
              onClick={() => onAction('checkin')}
            >
              {busy === 'checkin' ? 'Đang check-in…' : 'Check-in'}
            </button>
          )}
          {phase === 'in_use' && (
            <button type="button" className="button" disabled={busy !== null} onClick={() => onAction('end')}>
              {busy === 'end' ? 'Đang trả phòng…' : 'Trả phòng sớm'}
            </button>
          )}
          {canCancel &&
            (confirmingCancel ? (
              <button
                type="button"
                className="button button--danger"
                disabled={busy !== null}
                onClick={() => onAction('cancel')}
              >
                {busy === 'cancel' ? 'Đang huỷ…' : 'Bấm lần nữa để huỷ'}
              </button>
            ) : (
              <button
                type="button"
                className="button"
                disabled={busy !== null}
                onClick={() => setConfirmingCancel(true)}
              >
                Huỷ lịch
              </button>
            ))}
        </div>
      )}
    </article>
  )
}
