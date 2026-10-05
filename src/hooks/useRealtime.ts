import { useEffect, useSyncExternalStore } from 'react'
import { getState, subscribe, watchDay, type DayState, type RealtimeState } from '../store/realtime.ts'

/**
 * Đọc một phần của store realtime. `selector` phải trả về tham chiếu có sẵn
 * trong state (không tạo mảng/object mới) — tính toán thêm thì dùng useMemo.
 */
export function useRealtime<T>(selector: (s: RealtimeState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getState()))
}

/** Theo dõi realtime một ngày: join room khi mount, rời room khi unmount. */
export function useDay(date: string): DayState | undefined {
  useEffect(() => watchDay(date), [date])
  return useRealtime((s) => s.days[date])
}
