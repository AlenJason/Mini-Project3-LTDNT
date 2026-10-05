import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isActive } from '../../shared/rules.ts'
import { campusDate, formatMinute, formatRange } from '../../shared/time.ts'
import type { Booking } from '../../shared/types.ts'
import { AppHeader } from '../components/AppHeader.tsx'
import { BookingCard, type BookingAction } from '../components/BookingCard.tsx'
import { useToast } from '../context/ToastContext.tsx'
import { useNow } from '../hooks/useNow.ts'
import { useRealtime } from '../hooks/useRealtime.ts'
import { errorFeedback, successFeedback } from '../services/haptics.ts'
import { cancelBooking, checkIn, endEarly, refreshMine } from '../store/realtime.ts'

type Tab = 'upcoming' | 'history'

const SUCCESS_MESSAGES: Record<BookingAction, (b: Booking) => string> = {
  checkin: (b) => `Đã check-in ${b.roomId}. Phòng là của nhóm bạn tới ${formatMinute(b.end)}.`,
  cancel: (b) => `Đã huỷ lịch ${b.roomId}, ${formatRange(b.start, b.end)}. Khung giờ đã mở cho người khác.`,
  end: (b) => `Đã trả phòng ${b.roomId}. Thời gian còn lại đã mở cho người khác.`,
}

const COMMANDS = { checkin: checkIn, cancel: cancelBooking, end: endEarly }

export function MyBookingsPage() {
  const toast = useToast()
  const now = useNow(1_000)
  const today = campusDate(now)
  const mine = useRealtime((s) => s.mine)
  const rooms = useRealtime((s) => s.rooms)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [busy, setBusy] = useState<{ id: string; action: BookingAction } | null>(null)

  useEffect(() => {
    void refreshMine()
  }, [])

  const upcoming = useMemo(() => (mine ?? []).filter(isActive), [mine])
  const history = useMemo(
    () => (mine ?? []).filter((b) => !isActive(b)).sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start),
    [mine],
  )
  const list = tab === 'upcoming' ? upcoming : history

  async function act(booking: Booking, action: BookingAction) {
    setBusy({ id: booking.id, action })
    const res = await COMMANDS[action](booking.id)
    setBusy(null)
    if (res.ok) {
      successFeedback()
      toast(SUCCESS_MESSAGES[action](res.data), 'success')
    } else {
      errorFeedback()
      toast(res.error.message, 'error')
    }
  }

  return (
    <>
      <AppHeader title="Lịch của tôi">
        <div className="segmented" role="tablist" aria-label="Loại lịch">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upcoming'}
            className={`segmented__item${tab === 'upcoming' ? ' is-selected' : ''}`}
            onClick={() => setTab('upcoming')}
          >
            Sắp tới{upcoming.length > 0 && <span className="segmented__count">{upcoming.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={`segmented__item${tab === 'history' ? ' is-selected' : ''}`}
            onClick={() => setTab('history')}
          >
            Đã qua
          </button>
        </div>
      </AppHeader>

      <main className="page">
        {mine === null && <p className="muted">Đang tải lịch của bạn…</p>}

        {mine !== null && list.length === 0 && (
          <div className="empty">
            {tab === 'upcoming' ? (
              <>
                <p>Bạn chưa có lịch nào sắp tới. Chọn một phòng trống để đặt.</p>
                <Link to="/" className="button button--primary">
                  Tìm phòng trống
                </Link>
              </>
            ) : (
              <p>Lịch đã dùng, đã huỷ hoặc tự huỷ sẽ hiện ở đây.</p>
            )}
          </div>
        )}

        <div className="bookinglist">
          {list.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              room={rooms?.find((r) => r.id === b.roomId)}
              today={today}
              now={now}
              busy={busy?.id === b.id ? busy.action : null}
              onAction={(action) => act(b, action)}
            />
          ))}
        </div>
      </main>
    </>
  )
}
