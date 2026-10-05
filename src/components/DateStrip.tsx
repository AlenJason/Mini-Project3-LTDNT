import { BOOKING_WINDOW_DAYS } from '../../shared/rules.ts'
import { addDays, dayLabel, dayOfMonth, weekdayShort } from '../../shared/time.ts'
import { tapFeedback } from '../services/haptics.ts'

interface Props {
  today: string
  value: string
  onChange: (date: string) => void
}

/** Chọn ngày trong khoảng được phép đặt trước (hôm nay + 6 ngày). */
export function DateStrip({ today, value, onChange }: Props) {
  const days = Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => addDays(today, i))
  return (
    <div className="datestrip" role="radiogroup" aria-label="Chọn ngày">
      {days.map((date) => (
        <button
          key={date}
          type="button"
          role="radio"
          aria-checked={date === value}
          aria-label={dayLabel(date, today)}
          className={`datestrip__day${date === value ? ' is-selected' : ''}${date === today ? ' is-today' : ''}`}
          onClick={() => {
            tapFeedback()
            onChange(date)
          }}
        >
          <span className="datestrip__weekday">{date === today ? 'Nay' : weekdayShort(date)}</span>
          <span className="datestrip__num">{dayOfMonth(date)}</span>
        </button>
      ))}
    </div>
  )
}
