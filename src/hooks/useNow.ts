import { useEffect, useState } from 'react'

/** Thời điểm hiện tại, tự cập nhật sau mỗi `intervalMs`. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
