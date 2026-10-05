import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toEpoch } from '../shared/time.ts'
import type { User } from '../shared/types.ts'
import { BookingEngine } from './engine.ts'
import { ROOMS } from './seed.ts'
import type { ServiceState } from './bookingService.ts'
import type { Snapshot, StateStore } from './store.ts'

/** Store trong bộ nhớ, trễ ngẫu nhiên để mô phỏng Redis qua mạng */
class SlowStore implements StateStore {
  state: ServiceState = { bookings: [], holds: [] }
  version = 0
  conflicts = 0
  private delay = () => new Promise((r) => setTimeout(r, Math.random() * 5))
  async load(): Promise<Snapshot> {
    await this.delay()
    return { state: structuredClone(this.state), version: String(this.version) }
  }
  async save(state: ServiceState, version: string) {
    await this.delay()
    if (version !== String(this.version)) {
      this.conflicts++
      return false
    }
    this.state = structuredClone(state)
    this.version++
    return true
  }
}

const now = toEpoch('2026-10-05', 8 * 60)
const users: User[] = Array.from({ length: 8 }, (_, i) => ({ id: `23IT00${i}`, name: `Sinh viên ${i}` }))

describe('BookingEngine (nhiều instance dùng chung một store)', () => {
  it('8 người ở 4 instance cùng đặt một khung giờ: chỉ đúng 1 người thành công', async () => {
    const store = new SlowStore()
    const instances = Array.from({ length: 4 }, () => new BookingEngine(store, ROOMS, () => now))
    const results = await Promise.all(
      users.map((u, i) =>
        instances[i % instances.length].run((s) =>
          s.createBooking(u, { roomId: 'TV-201', date: '2026-10-05', start: 600, end: 660, purpose: 'x', attendees: 2 }),
        ),
      ),
    )
    assert.equal(results.filter((r) => r.ok).length, 1)
    assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && r.error.code === 'SLOT_TAKEN'))
    assert.equal(store.state.bookings.length, 1)
    assert.ok(store.conflicts > 0, 'phải có xung đột ghi để kiểm tra được cơ chế thử lại')
  })

  it('thao tác chỉ đọc không ghi vào store', async () => {
    const store = new SlowStore()
    const engine = new BookingEngine(store, ROOMS, () => now)
    await engine.run((s) => s.snapshot('2026-10-05'))
    assert.equal(store.version, 0)
  })

  it('chỉ phát sự kiện sau khi ghi thành công', async () => {
    const store = new SlowStore()
    const engine = new BookingEngine(store, ROOMS, () => now)
    const seen: string[] = []
    engine.subscribe((e) => seen.push(e.type))
    await engine.run((s) => s.createHold(users[0], { roomId: 'TV-202', date: '2026-10-05', start: 600, end: 630 }, 'sock'))
    assert.deepEqual(seen, ['hold'])
    assert.equal(store.state.holds[0].ownerKey, 'sock')
  })
})
