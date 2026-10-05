// Nơi lưu trạng thái lịch đặt phòng, có kiểm tra phiên bản (compare-and-set):
// - MemoryStore: chạy local một tiến trình, lưu lịch vào server/data.json.
// - RedisStore: chạy trên Vercel (nhiều instance dùng chung một Redis).

import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { ServiceState } from './bookingService.ts'

export interface Snapshot {
  state: ServiceState
  version: string
}

export interface StateStore {
  load(): Promise<Snapshot>
  /** Ghi state nếu phiên bản vẫn là `version`; trả về false nếu đã có người ghi trước. */
  save(state: ServiceState, version: string): Promise<boolean>
}

const emptyState = (): ServiceState => ({ bookings: [], holds: [] })

// ----------------------------------------------------------------- bộ nhớ

const DATA_FILE = process.env.DATA_FILE ?? fileURLToPath(new URL('./data.json', import.meta.url))

export class MemoryStore implements StateStore {
  private state: ServiceState
  private version = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    this.state = emptyState()
    try {
      const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as { bookings?: unknown }
      if (Array.isArray(raw.bookings)) this.state.bookings = raw.bookings as ServiceState['bookings']
    } catch {
      // Chưa có file dữ liệu — bắt đầu trống
    }
  }

  async load(): Promise<Snapshot> {
    return { state: structuredClone(this.state), version: String(this.version) }
  }

  async save(state: ServiceState, version: string): Promise<boolean> {
    if (version !== String(this.version)) return false
    this.state = structuredClone(state)
    this.version++
    this.persist()
    return true
  }

  /** Ghi lịch ra file (debounce); hold là tạm thời nên không lưu. */
  private persist() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      writeFile(DATA_FILE, JSON.stringify({ bookings: this.state.bookings }, null, 2)).catch((err) =>
        console.error('[store] Không ghi được file dữ liệu:', err),
      )
    }, 300)
  }
}

// ------------------------------------------------------------------ Redis

/** Phần tối thiểu của client `redis` mà store cần */
export interface RedisCommands {
  mGet(keys: string[]): Promise<unknown[]>
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}

const STATE_KEY = 'roombooking:state'
const VERSION_KEY = 'roombooking:version'

// Ghi state chỉ khi phiên bản chưa đổi — chạy nguyên tử trong Redis
const COMPARE_AND_SET = `
if (redis.call('GET', KEYS[2]) or '0') == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  return redis.call('INCR', KEYS[2])
end
return 0`

export class RedisStore implements StateStore {
  private readonly client: RedisCommands

  constructor(client: RedisCommands) {
    this.client = client
  }

  async load(): Promise<Snapshot> {
    const [raw, version] = await this.client.mGet([STATE_KEY, VERSION_KEY])
    return {
      state: raw ? (JSON.parse(String(raw)) as ServiceState) : emptyState(),
      version: version ? String(version) : '0',
    }
  }

  async save(state: ServiceState, version: string): Promise<boolean> {
    const result = await this.client.eval(COMPARE_AND_SET, {
      keys: [STATE_KEY, VERSION_KEY],
      arguments: [version, JSON.stringify(state)],
    })
    return Number(result) > 0
  }
}
