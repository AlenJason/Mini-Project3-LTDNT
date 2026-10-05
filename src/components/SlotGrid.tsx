import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { SLOT_MINUTES, currentSlotStart, overlaps, slotStarts, type Span } from '../../shared/rules.ts'
import { formatMinute, formatRange } from '../../shared/time.ts'
import type { Booking, Hold, Room } from '../../shared/types.ts'
import { shortName } from '../lib/rooms.ts'

const FLASH_MS = 2_500

interface Props {
  room: Room
  bookings: Booking[]
  holds: Hold[]
  myId?: string
  /** Phút hiện tại nếu đang xem hôm nay, null nếu ngày khác */
  nowMinute: number | null
  selection: Span | null
  changed: Record<string, number>
  disabled?: boolean
  /** Thời điểm render (epoch ms) — để biết ô nào vừa đổi */
  now: number
  onTapSlot: (start: number) => void
}

/**
 * Lưới khung giờ 30 phút trong ngày của một phòng. Ô trống bấm được; lịch đã
 * đặt và chỗ đang được giữ phủ lên trên thành từng khối.
 */
export function SlotGrid({ room, bookings, holds, myId, nowMinute, selection, changed, disabled, now, onTapSlot }: Props) {
  // Hôm nay: bỏ bớt các khung đã qua, chỉ giữ 1 giờ gần nhất làm mốc
  const gridStart =
    nowMinute === null
      ? room.openMinute
      : Math.max(room.openMinute, Math.min(Math.floor(nowMinute / 60) * 60 - 60, room.closeMinute - 60))
  const starts = slotStarts(room).filter((s) => s >= gridStart)
  const row = (minute: number) => (Math.max(minute, gridStart) - gridStart) / SLOT_MINUTES + 1
  const area = (s: Span): CSSProperties => ({ gridRow: `${row(s.start)} / ${row(s.end)}` })
  const visible = (s: Span) => s.end > gridStart
  const firstOpenSlot = nowMinute === null ? -Infinity : currentSlotStart(nowMinute)
  const othersHolds = holds.filter((h) => h.userId !== myId)
  const flash = (id: string) => ((changed[id] ?? 0) > now - FLASH_MS ? ' is-flash' : '')

  return (
    <>
      {gridStart > room.openMinute && (
        <p className="slotgrid__hidden">Đã ẩn các khung trước {formatMinute(gridStart)} vì đã qua.</p>
      )}
      <div className="slotgrid" style={{ '--rows': starts.length } as CSSProperties}>
        <ol className="slotgrid__times" aria-hidden>
          {starts.map((s) => (
            <li key={s} className={s % 60 === 0 ? 'is-hour' : undefined}>
              {formatMinute(s)}
            </li>
          ))}
        </ol>

        <div className="slotgrid__track">
          {starts.map((s) => {
            const slot = { start: s, end: s + SLOT_MINUTES }
            const past = s < firstOpenSlot
            const taken = bookings.some((b) => overlaps(b, slot)) || othersHolds.some((h) => overlaps(h, slot))
            const selected = selection !== null && overlaps(selection, slot)
            const state = past ? 'đã qua' : taken ? 'đã có người đặt hoặc giữ' : selected ? 'bạn đang chọn' : 'trống'
            return (
              <button
                key={s}
                type="button"
                className={`slot${past ? ' slot--past' : ''}${s % 60 === 0 ? ' slot--hour' : ''}`}
                style={{ gridRow: row(s) }}
                disabled={disabled || past || taken}
                aria-pressed={selected}
                aria-label={`${formatRange(slot.start, slot.end)}, ${state}`}
                onClick={() => onTapSlot(s)}
              />
            )
          })}

          {bookings.filter(visible).map((b) => {
            const mine = b.userId === myId
            return (
              <div
                key={b.id}
                className={`block ${mine ? 'block--mine' : 'block--taken'}${flash(b.id)}`}
                style={area(b)}
                aria-hidden
              >
                <span className="block__title">
                  {mine && <Check size={14} />}
                  {mine ? 'Lịch của bạn' : `Đã đặt, ${shortName(b.userName)}`}
                </span>
                <span className="block__meta">
                  {formatRange(b.start, b.end)}
                  {mine && ` — ${b.purpose}`}
                </span>
              </div>
            )
          })}

          {othersHolds.filter(visible).map((h) => (
            <div key={h.id} className={`block block--held${flash(h.id)}`} style={area(h)} aria-hidden>
              <span className="block__title">Có người đang giữ chỗ</span>
              <span className="block__meta">{formatRange(h.start, h.end)}</span>
            </div>
          ))}

          {selection && (
            <div className="block block--selection" style={area(selection)} aria-hidden>
              <span className="block__title">Bạn đang chọn</span>
              <span className="block__meta">{formatRange(selection.start, selection.end)}</span>
            </div>
          )}

          {nowMinute !== null && nowMinute >= gridStart && nowMinute <= room.closeMinute && (
            <div
              className="slotgrid__now"
              style={{ '--offset': (nowMinute - gridStart) / SLOT_MINUTES } as CSSProperties}
              aria-hidden
            />
          )}
        </div>
      </div>
    </>
  )
}
