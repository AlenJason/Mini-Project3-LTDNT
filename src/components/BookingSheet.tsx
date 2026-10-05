import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { HOLD_TTL_MS, MAX_PURPOSE_LENGTH, type Span } from '../../shared/rules.ts'
import { dayLabel, formatDuration, formatRange } from '../../shared/time.ts'
import type { Hold, Room } from '../../shared/types.ts'
import { useNow } from '../hooks/useNow.ts'

const PURPOSES = ['Học nhóm', 'Ôn thi', 'Làm đồ án', 'Họp CLB', 'Thực hành']

interface Props {
  room: Room
  date: string
  today: string
  selection: Span
  hold: Hold | null
  submitting: boolean
  error: string | null
  onSubmit: (purpose: string, attendees: number) => void
  onClose: () => void
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function BookingSheet({ room, date, today, selection, hold, submitting, error, onSubmit, onClose }: Props) {
  const [purpose, setPurpose] = useState('Học nhóm')
  const [attendees, setAttendees] = useState(Math.min(2, room.capacity))
  const now = useNow(1_000)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const remaining = hold ? hold.expiresAt - now : 0
  const progress = hold ? Math.max(0, Math.min(1, remaining / HOLD_TTL_MS)) : 0

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!submitting) onSubmit(purpose, attendees)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="sheet__head">
          <div>
            <h2 id={titleId} className="sheet__title">
              Đặt <span className="plate">{room.id}</span>
            </h2>
            <p className="sheet__when">
              {dayLabel(date, today)}, {formatRange(selection.start, selection.end)} (
              {formatDuration(selection.end - selection.start)})
            </p>
          </div>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <div className={`holdbar${hold ? '' : ' is-pending'}`}>
          <div className="holdbar__track">
            <div className="holdbar__fill" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="holdbar__text">
            {hold
              ? `Khung giờ đang được giữ cho bạn trong ${formatCountdown(remaining)}`
              : 'Đang giữ chỗ…'}
          </p>
        </div>

        <fieldset className="field">
          <legend className="field__label">Mục đích</legend>
          <div className="chips">
            {PURPOSES.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${purpose === p ? ' is-selected' : ''}`}
                aria-pressed={purpose === p}
                onClick={() => setPurpose(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            className="input"
            value={purpose}
            maxLength={MAX_PURPOSE_LENGTH}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Ví dụ: Ôn thi Cấu trúc dữ liệu"
            aria-label="Mục đích sử dụng phòng"
          />
        </fieldset>

        <div className="field field--row">
          <span className="field__label" id={`${titleId}-people`}>
            Số người
            <span className="field__hint">Sức chứa {room.capacity}</span>
          </span>
          <div className="stepper" role="group" aria-labelledby={`${titleId}-people`}>
            <button
              type="button"
              className="icon-button"
              onClick={() => setAttendees((n) => Math.max(1, n - 1))}
              disabled={attendees <= 1}
              aria-label="Bớt một người"
            >
              <Minus size={18} />
            </button>
            <output className="stepper__value" aria-live="polite">
              {attendees}
            </output>
            <button
              type="button"
              className="icon-button"
              onClick={() => setAttendees((n) => Math.min(room.capacity, n + 1))}
              disabled={attendees >= room.capacity}
              aria-label="Thêm một người"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="button button--primary button--block" disabled={submitting || !hold}>
          {submitting ? 'Đang đặt phòng…' : `Đặt phòng ${formatRange(selection.start, selection.end)}`}
        </button>
      </form>
    </div>
  )
}
