// Giao thức Socket.IO giữa app và server realtime.
//
// Client gửi lệnh kèm ack (callback) và nhận về Result. Mọi thay đổi trạng thái
// được server phát tới room "day:<YYYY-MM-DD>" (ai đang xem ngày đó) và
// "user:<MSSV>" (mọi thiết bị của người đặt).

import type { ErrorCode } from './rules.ts'
import type { Booking, BookingRequest, Hold, SlotRequest } from './types.ts'

/**
 * Đường dẫn Socket.IO. Nằm dưới /api để trên Vercel đi vào cùng function với
 * REST API (api/server.ts). Chỉ dùng transport websocket — Vercel Functions
 * không hỗ trợ long-polling của Socket.IO.
 */
export const SOCKET_PATH = '/api/socket.io'

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } }

export interface DaySnapshot {
  date: string
  bookings: Booking[]
  holds: Hold[]
}

export type HoldRemovedReason = 'released' | 'expired' | 'booked' | 'disconnected' | 'replaced'

export interface HoldRemoved {
  id: string
  userId: string
  roomId: string
  date: string
  reason: HoldRemovedReason
}

export interface Notice {
  kind: 'no_show' | 'info'
  message: string
  bookingId?: string
}

export interface ServerToClientEvents {
  'booking:upsert': (booking: Booking) => void
  'hold:upsert': (hold: Hold) => void
  'hold:remove': (removed: HoldRemoved) => void
  presence: (p: { online: number }) => void
  notice: (n: Notice) => void
}

type Ack<T> = (result: Result<T>) => void

export interface ClientToServerEvents {
  'day:join': (date: string, ack: Ack<DaySnapshot>) => void
  'day:leave': (date: string) => void
  'mine:list': (ack: Ack<Booking[]>) => void
  'hold:create': (req: SlotRequest, ack: Ack<Hold>) => void
  'hold:release': (ack: Ack<null>) => void
  'booking:create': (req: BookingRequest, ack: Ack<Booking>) => void
  'booking:cancel': (id: string, ack: Ack<Booking>) => void
  'booking:checkin': (id: string, ack: Ack<Booking>) => void
  'booking:end': (id: string, ack: Ack<Booking>) => void
}

/** Thông tin client gửi kèm khi kết nối (socket.handshake.auth) */
export interface HandshakeAuth {
  userId?: string
  name?: string
}
