import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BOOKING_WINDOW_DAYS } from '../../shared/rules.ts'
import { campusDate, daysBetween, isValidDate } from '../../shared/time.ts'
import { useNow } from './useNow.ts'

/**
 * Ngày đang xem, lưu trên URL (?date=YYYY-MM-DD) để chuyển giữa danh sách và
 * chi tiết phòng vẫn giữ nguyên ngày. Ngày ngoài khoảng đặt được -> hôm nay.
 */
export function useSelectedDate() {
  const [params, setParams] = useSearchParams()
  const now = useNow(30_000)
  const today = campusDate(now)
  const raw = params.get('date')
  const ahead = raw && isValidDate(raw) ? daysBetween(today, raw) : -1
  const date = raw && ahead >= 0 && ahead < BOOKING_WINDOW_DAYS ? raw : today

  const setDate = useCallback(
    (next: string) =>
      setParams(
        (p) => {
          p.set('date', next)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  return { date, setDate, today, now }
}
