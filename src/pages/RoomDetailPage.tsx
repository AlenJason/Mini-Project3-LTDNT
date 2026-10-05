import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MonitorSmartphone, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import {
  CHECKIN_GRACE_MINUTES,
  HOLD_TTL_MS,
  MAX_BOOKING_MINUTES,
  SLOT_MINUTES,
  currentSlotStart,
  overlaps,
  type Span,
} from '../../shared/rules.ts'
import { campusMinute, formatDuration, formatRange } from '../../shared/time.ts'
import { AppHeader } from '../components/AppHeader.tsx'
import { BookingSheet } from '../components/BookingSheet.tsx'
import { DateStrip } from '../components/DateStrip.tsx'
import { SlotGrid } from '../components/SlotGrid.tsx'
import { useSession } from '../context/SessionContext.tsx'
import { useToast } from '../context/ToastContext.tsx'
import { useDay, useRealtime } from '../hooks/useRealtime.ts'
import { useSelectedDate } from '../hooks/useSelectedDate.ts'
import { AMENITIES, ROOM_TYPE_LABELS, roomLocation } from '../lib/rooms.ts'
import { errorFeedback, successFeedback, tapFeedback } from '../services/haptics.ts'
import { notificationPermission, requestNotificationPermission, syncReminders } from '../services/notifications.ts'
import { createBooking, getState, holdSlot, onRealtimeEvent, releaseHold } from '../store/realtime.ts'

const HOLD_DEBOUNCE_MS = 250

export function RoomDetailPage() {
  const { roomId = '' } = useParams()
  const { user } = useSession()
  const toast = useToast()
  const { date, setDate, today, now } = useSelectedDate()
  const rooms = useRealtime((s) => s.rooms)
  const status = useRealtime((s) => s.status)
  const myHold = useRealtime((s) => s.myHold)
  const day = useDay(date)
  const room = rooms?.find((r) => r.id === roomId)

  const [selection, setSelection] = useState<Span | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestSelection = useRef<Span | null>(null)
  useEffect(() => {
    latestSelection.current = selection
  }, [selection])

  const isToday = date === today
  const nowMinute = isToday ? campusMinute(now) : null
  const bookings = useMemo(() => (day ? Object.values(day.bookings).filter((b) => b.roomId === roomId) : []), [day, roomId])
  const holds = useMemo(
    () => (day ? Object.values(day.holds).filter((h) => h.roomId === roomId && h.expiresAt > now) : []),
    [day, roomId, now],
  )
  const othersHolds = useMemo(() => holds.filter((h) => h.userId !== user?.id), [holds, user])
  const holdMatches =
    myHold !== null &&
    selection !== null &&
    myHold.roomId === roomId &&
    myHold.date === date &&
    myHold.start === selection.start &&
    myHold.end === selection.end

  // Chọn giờ -> giữ chỗ trên server (debounce để chạm liên tiếp chỉ gửi một lần)
  useEffect(() => {
    if (!selection) {
      void releaseHold()
      return
    }
    const timer = setTimeout(async () => {
      const res = await holdSlot({ roomId, date, start: selection.start, end: selection.end })
      if (!res.ok && latestSelection.current === selection) {
        errorFeedback()
        toast(res.error.message, 'error')
        setSelection(null)
        setSheetOpen(false)
      }
    }, HOLD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [selection, roomId, date, toast])

  // Rời trang -> nhả chỗ đang giữ
  useEffect(() => () => void releaseHold(), [])

  // Hết 2 phút hoặc mất kết nối -> server đã nhả chỗ
  useEffect(
    () =>
      onRealtimeEvent((e) => {
        if (e.type !== 'hold_lost' || !latestSelection.current) return
        setSelection(null)
        setSheetOpen(false)
        toast(
          e.reason === 'expired'
            ? `Hết ${HOLD_TTL_MS / 60_000} phút giữ chỗ nên khung giờ đã được nhả. Chọn lại nếu vẫn muốn đặt.`
            : 'Mất kết nối nên khung giờ đang giữ đã được nhả.',
          'info',
        )
      }),
    [toast],
  )

  const isFree = useCallback(
    (span: Span) => {
      if (nowMinute !== null && span.start < currentSlotStart(nowMinute)) return false
      return !bookings.some((b) => overlaps(b, span)) && !othersHolds.some((h) => overlaps(h, span))
    },
    [bookings, othersHolds, nowMinute],
  )

  function tapSlot(start: number) {
    tapFeedback()
    const slot = { start, end: start + SLOT_MINUTES }
    setError(null)
    setSelection((sel) => {
      if (!sel) return slot
      if (start >= sel.start && start < sel.end) {
        // Chạm vào khung đang chọn: thu ngắn tới khung đó, hoặc bỏ chọn nếu chỉ có một khung
        return sel.end - sel.start === SLOT_MINUTES ? null : { start: sel.start, end: start + SLOT_MINUTES }
      }
      const extended = start < sel.start ? { start, end: sel.end } : { start: sel.start, end: start + SLOT_MINUTES }
      if (extended.end - extended.start <= MAX_BOOKING_MINUTES && isFree(extended)) return extended
      return slot
    })
  }

  function changeDate(next: string) {
    setSelection(null)
    setSheetOpen(false)
    setDate(next)
  }

  async function submit(purpose: string, attendees: number) {
    if (!selection || !room) return
    setSubmitting(true)
    setError(null)
    const res = await createBooking({ roomId, date, start: selection.start, end: selection.end, purpose, attendees })
    setSubmitting(false)
    if (!res.ok) {
      errorFeedback()
      if (res.error.code === 'SLOT_TAKEN' || res.error.code === 'SLOT_HELD') {
        toast(res.error.message, 'error')
        setSheetOpen(false)
        setSelection(null)
      } else {
        setError(res.error.message)
      }
      return
    }
    successFeedback()
    toast(`Đã đặt ${room.id}, ${formatRange(res.data.start, res.data.end)}. Nhớ check-in trong ${CHECKIN_GRACE_MINUTES} phút đầu.`, 'success')
    setSheetOpen(false)
    setSelection(null)
    // Lần đặt đầu tiên: xin quyền thông báo để nhắc check-in (chỉ trên điện thoại)
    if ((await notificationPermission()) === 'prompt' && (await requestNotificationPermission()) === 'granted') {
      void syncReminders(getState().mine ?? [])
    }
  }

  if (!rooms) {
    return (
      <>
        <AppHeader title="Phòng" back />
        <main className="page">
          <p className="muted">Đang tải thông tin phòng…</p>
        </main>
      </>
    )
  }

  if (!room) {
    return (
      <>
        <AppHeader title="Phòng" back />
        <main className="page">
          <div className="empty">
            <p>Không tìm thấy phòng {roomId}.</p>
            <Link to="/" className="button">
              Về danh sách phòng
            </Link>
          </div>
        </main>
      </>
    )
  }

  const offline = status !== 'online'

  return (
    <>
      <AppHeader title={room.name} back>
        <DateStrip today={today} value={date} onChange={changeDate} />
      </AppHeader>

      <main className={`page page--detail${selection ? ' has-actionbar' : ''}`}>
        <section className="roominfo">
          <div className="roominfo__plate">
            <span className="plate plate--xl">{room.id}</span>
            <span className="roominfo__type">{ROOM_TYPE_LABELS[room.type]}</span>
          </div>
          <p className="roominfo__meta">
            {roomLocation(room)}
            <span className="roominfo__cap">
              <Users size={14} aria-hidden /> {room.capacity} chỗ
            </span>
          </p>
          <p className="roominfo__desc">{room.description}</p>
          <ul className="amenities">
            {room.amenities.map((a) => {
              const { label, icon: Icon } = AMENITIES[a]
              return (
                <li key={a}>
                  <Icon size={15} aria-hidden /> {label}
                </li>
              )
            })}
          </ul>
          <Link to={`/display/${room.id}`} className="roominfo__display">
            <MonitorSmartphone size={15} aria-hidden /> Xem màn hình trước cửa phòng
          </Link>
        </section>

        <div className="legend" aria-hidden>
          <span className="legend__item legend__item--free">Trống</span>
          <span className="legend__item legend__item--mine">Của bạn</span>
          <span className="legend__item legend__item--taken">Đã đặt</span>
          <span className="legend__item legend__item--held">Đang được giữ</span>
        </div>

        {!day?.loaded && Object.keys(day?.bookings ?? {}).length === 0 ? (
          <p className="muted">{offline ? 'Chưa có dữ liệu lịch — đang chờ kết nối máy chủ.' : 'Đang tải lịch…'}</p>
        ) : (
          <SlotGrid
            room={room}
            bookings={bookings}
            holds={holds}
            myId={user?.id}
            nowMinute={nowMinute}
            selection={selection}
            changed={day?.changed ?? {}}
            disabled={offline}
            now={now}
            onTapSlot={tapSlot}
          />
        )}
      </main>

      {selection && (
        <div className="actionbar" role="region" aria-label="Khung giờ đang chọn">
          <div className="actionbar__info">
            <strong>{formatRange(selection.start, selection.end)}</strong>
            <span>
              {formatDuration(selection.end - selection.start)}
              {holdMatches ? ', đang giữ chỗ cho bạn' : ', đang giữ chỗ…'}
            </span>
          </div>
          <button type="button" className="button button--ghost" onClick={() => setSelection(null)}>
            Bỏ chọn
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!holdMatches}
            onClick={() => setSheetOpen(true)}
          >
            Tiếp tục
          </button>
        </div>
      )}

      {sheetOpen && selection && (
        <BookingSheet
          room={room}
          date={date}
          today={today}
          selection={selection}
          hold={holdMatches ? myHold : null}
          submitting={submitting}
          error={error}
          onSubmit={submit}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}
