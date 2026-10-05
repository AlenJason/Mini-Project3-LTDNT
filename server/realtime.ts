// Dựng server realtime: Express (REST) + Socket.IO trên cùng một http.Server.
// Dùng chung cho chạy local (server/index.ts) và Vercel Function (api/server.ts).
//
// - Có REDIS_URL (Vercel + Upstash): state lưu trong Redis, Socket.IO dùng Redis
//   adapter để phát sự kiện tới client đang kết nối ở mọi instance.
// - Không có: state lưu trong bộ nhớ + server/data.json (một tiến trình).

import { createServer, type Server as HttpServer } from 'node:http'
import { createAdapter } from '@socket.io/redis-adapter'
import express, { type Express } from 'express'
import { createClient } from 'redis'
import { Server } from 'socket.io'
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type HandshakeAuth,
  type Result,
  type ServerToClientEvents,
} from '../shared/protocol.ts'
import { campusDate, isValidDate } from '../shared/time.ts'
import type { User } from '../shared/types.ts'
import { fail, ok, type BookingService } from './bookingService.ts'
import { startDemoBots } from './demoBots.ts'
import { BookingEngine, ConflictError } from './engine.ts'
import { ROOMS, demoBookings } from './seed.ts'
import { MemoryStore, RedisStore, type StateStore } from './store.ts'

const SWEEP_EVERY_MS = 10_000

export interface RealtimeServer {
  app: Express
  httpServer: HttpServer
}

export async function createRealtimeServer(): Promise<RealtimeServer> {
  // ------------------------------------------------------------- lưu trữ
  const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL
  let store: StateStore
  let adapter: ReturnType<typeof createAdapter> | undefined
  if (redisUrl) {
    const client = createClient({ url: redisUrl })
    const subscriber = client.duplicate()
    client.on('error', (err) => console.error('[redis] lỗi kết nối:', err))
    subscriber.on('error', (err) => console.error('[redis] lỗi kết nối (sub):', err))
    await Promise.all([client.connect(), subscriber.connect()])
    store = new RedisStore(client)
    adapter = createAdapter(client, subscriber)
  } else {
    store = new MemoryStore()
  }
  const engine = new BookingEngine(store, ROOMS)

  // Ngày mới chưa có lịch nào -> thêm lịch demo để màn hình không trống.
  // Lỗi ở bước này không được chặn server khởi động.
  try {
    await engine.run((s) => {
      if (!s.hasBookingsOn(campusDate())) s.importBookings(demoBookings())
    })
  } catch (err) {
    console.error('[seed] Không thêm được dữ liệu demo:', err)
  }

  // ---------------------------------------------------------------- HTTP
  const app = express()
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return void res.sendStatus(204)
    next()
  })
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: Date.now(), storage: redisUrl ? 'redis' : 'memory' })
  })
  app.get('/api/rooms', (_req, res) => {
    res.json(engine.roomList)
  })

  const httpServer = createServer(app)

  // ----------------------------------------------------------- Socket.IO
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { user: User | null }>(
    httpServer,
    {
      path: SOCKET_PATH,
      // Vercel Functions chỉ hỗ trợ websocket, không có long-polling
      transports: ['websocket'],
      // App Capacitor chạy ở origin https://localhost (Android) / capacitor://localhost (iOS)
      cors: { origin: true },
      adapter,
    },
  )

  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as HandshakeAuth
    const id = typeof auth.userId === 'string' ? auth.userId.trim().toUpperCase().slice(0, 20) : ''
    const name = typeof auth.name === 'string' ? auth.name.trim().slice(0, 60) : ''
    // Không có thông tin đăng nhập vẫn kết nối được ở chế độ chỉ xem (màn hình phòng)
    socket.data.user = id && name ? { id, name } : null
    next()
  })

  // Số thiết bị đang kết nối trên mọi instance (qua adapter), gom lại 1 giây
  let presenceTimer: ReturnType<typeof setTimeout> | undefined
  function broadcastPresence() {
    clearTimeout(presenceTimer)
    presenceTimer = setTimeout(async () => {
      try {
        const sockets = await io.fetchSockets()
        io.emit('presence', { online: sockets.length })
      } catch {
        io.emit('presence', { online: io.of('/').sockets.size })
      }
    }, 1_000)
  }

  io.on('connection', (socket) => {
    const user = socket.data.user
    if (user) socket.join(`user:${user.id}`)
    broadcastPresence()

    /** Bọc handler: kiểm tra đăng nhập, chạy qua engine, bắt lỗi, luôn trả ack. */
    async function command<T>(ack: unknown, run: (service: BookingService, user: User) => Result<T>) {
      if (typeof ack !== 'function') return
      if (!user) return ack(fail('UNAUTHENTICATED'))
      try {
        ack(await engine.run((s) => run(s, user)))
      } catch (err) {
        if (err instanceof ConflictError) return ack(fail('BUSY'))
        console.error('[socket] Lỗi xử lý lệnh:', err)
        ack(fail('INVALID_INPUT'))
      }
    }

    socket.on('day:join', async (date, ack) => {
      if (typeof ack !== 'function') return
      if (!isValidDate(date)) return ack(fail('INVALID_INPUT'))
      socket.join(`day:${date}`)
      try {
        // Quét trước khi trả snapshot: hold hết hạn / no-show được xử lý ngay
        // cả khi không instance nào đang chạy vòng quét định kỳ
        ack(
          await engine.run((s) => {
            s.sweep()
            return ok(s.snapshot(date))
          }),
        )
      } catch {
        ack(fail('BUSY'))
      }
    })

    socket.on('day:leave', (date) => {
      if (typeof date === 'string') socket.leave(`day:${date}`)
    })

    socket.on('mine:list', (ack) => command(ack, (s, u) => ok(s.bookingsOf(u.id))))
    socket.on('hold:create', (req, ack) => command(ack, (s, u) => s.createHold(u, req, socket.id)))
    socket.on('hold:release', (ack) =>
      command(ack, (s, u) => {
        s.releaseHold(u.id)
        return ok(null)
      }),
    )
    socket.on('booking:create', (req, ack) => command(ack, (s, u) => s.createBooking(u, req)))
    socket.on('booking:cancel', (id, ack) => command(ack, (s, u) => s.cancel(u, id)))
    socket.on('booking:checkin', (id, ack) => command(ack, (s, u) => s.checkIn(u, id)))
    socket.on('booking:end', (id, ack) => command(ack, (s, u) => s.endEarly(u, id)))

    socket.on('disconnect', () => {
      engine.run((s) => s.releaseHoldsByOwner(socket.id)).catch(() => {})
      broadcastPresence()
    })
  })

  // Thay đổi đã ghi thành công -> phát tới người đang xem ngày đó + mọi thiết bị của chủ lịch
  engine.subscribe((event) => {
    switch (event.type) {
      case 'booking': {
        const b = event.booking
        io.to(`day:${b.date}`).to(`user:${b.userId}`).emit('booking:upsert', b)
        break
      }
      case 'hold': {
        const h = event.hold
        io.to(`day:${h.date}`).to(`user:${h.userId}`).emit('hold:upsert', h)
        break
      }
      case 'hold_removed': {
        const r = event.removed
        io.to(`day:${r.date}`).to(`user:${r.userId}`).emit('hold:remove', r)
        break
      }
      case 'notice':
        io.to(`user:${event.userId}`).emit('notice', event.notice)
        break
    }
  })

  // Quét định kỳ (hold hết hạn, no-show) — chỉ khi instance này có người kết nối,
  // để instance rảnh không gọi Redis vô ích
  const hasClients = () => io.of('/').sockets.size > 0
  setInterval(() => {
    if (hasClients()) engine.run((s) => s.sweep()).catch(() => {})
  }, SWEEP_EVERY_MS)
  if (process.env.DEMO_BOTS !== 'off') startDemoBots(engine, hasClients)

  return { app, httpServer }
}
