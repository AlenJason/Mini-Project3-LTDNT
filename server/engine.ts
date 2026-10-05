// Chạy một thao tác nghiệp vụ: nạp state -> chạy BookingService -> ghi lại có
// kiểm tra phiên bản. Bị instance khác ghi trước thì thử lại từ đầu, nên mọi
// thao tác đều nguyên tử dù server có nhiều instance.

import type { Room } from '../shared/types.ts'
import { BookingService, type ServiceEvent } from './bookingService.ts'
import type { StateStore } from './store.ts'

const MAX_ATTEMPTS = 6

export class ConflictError extends Error {}

export class BookingEngine {
  private readonly store: StateStore
  private readonly rooms: Room[]
  private readonly clock: () => number
  private readonly listeners = new Set<(e: ServiceEvent) => void>()

  constructor(store: StateStore, rooms: Room[], clock: () => number = Date.now) {
    this.store = store
    this.rooms = rooms
    this.clock = clock
  }

  get roomList(): Room[] {
    return this.rooms
  }

  /** Nhận các thay đổi đã được ghi thành công (để phát tới client). */
  subscribe(fn: (e: ServiceEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * Chạy `operation` trên state mới nhất. Thao tác không đổi gì (chỉ đọc hoặc
   * bị từ chối) thì không ghi. `operation` phải đồng bộ và có thể chạy lại.
   */
  async run<T>(operation: (service: BookingService) => T): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { state, version } = await this.store.load()
      const service = new BookingService(this.rooms, state, this.clock)
      const events: ServiceEvent[] = []
      service.subscribe((e) => events.push(e))

      const result = operation(service)
      if (events.length === 0) return result
      if (await this.store.save(service.exportState(), version)) {
        for (const e of events) for (const fn of this.listeners) fn(e)
        return result
      }
      // Instance khác vừa ghi — chờ một chút ngẫu nhiên rồi chạy lại
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (attempt + 1)))
    }
    throw new ConflictError('Quá nhiều thao tác ghi đồng thời')
  }
}
