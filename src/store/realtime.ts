// Store realtime dùng chung toàn app (đọc qua useSyncExternalStore).
//
// - Giữ một kết nối Socket.IO tới server; tự kết nối lại khi mất mạng.
// - Mỗi màn hình "xem" một ngày (watchDay) -> join room "day:<ngày>" và nhận
//   snapshot + mọi thay đổi của ngày đó theo thời gian thực.
// - Danh sách phòng và "lịch của tôi" được cache bằng Preferences để vẫn xem
//   được khi offline.

import { io, type Socket } from 'socket.io-client'
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type DaySnapshot,
  type HoldRemoved,
  type HoldRemovedReason,
  type Notice,
  type Result,
  type ServerToClientEvents,
} from '../../shared/protocol.ts'
import { ERROR_MESSAGES, isBlocking } from '../../shared/rules.ts'
import type { Booking, BookingRequest, Hold, Room, SlotRequest, User } from '../../shared/types.ts'
import { readJson, writeJson } from '../services/storage.ts'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline'

export interface DayState {
  /** false khi chưa nhận snapshot hoặc dữ liệu có thể đã cũ (mất kết nối) */
  loaded: boolean
  /** Chỉ chứa lịch còn chiếm chỗ (confirmed / checked_in / completed) */
  bookings: Record<string, Booking>
  holds: Record<string, Hold>
  /** id -> thời điểm người khác vừa thay đổi (để nháy ô vừa đổi trên lưới) */
  changed: Record<string, number>
}

export interface RealtimeState {
  status: ConnectionStatus
  serverUrl: string
  online: number
  rooms: Room[] | null
  roomsError: boolean
  days: Record<string, DayState>
  /** null = chưa tải */
  mine: Booking[] | null
  myHold: Hold | null
}

export type RealtimeEvent =
  | { type: 'notice'; notice: Notice }
  | { type: 'hold_lost'; reason: HoldRemovedReason }

const REQUEST_TIMEOUT_MS = 10_000
const ROOMS_CACHE_KEY = 'cache-rooms'
const mineCacheKey = (userId: string) => `cache-mine-${userId}`

let state: RealtimeState = {
  status: 'idle',
  serverUrl: '',
  online: 0,
  rooms: null,
  roomsError: false,
  days: {},
  mine: null,
  myHold: null,
}

const listeners = new Set<() => void>()
const eventListeners = new Set<(e: RealtimeEvent) => void>()
const dayRefs = new Map<string, number>()
let socket: AppSocket | null = null
let currentUser: User | null = null
/** Tăng mỗi lần connect/disconnect — bỏ qua lần connect cũ còn đang chờ cache */
let connectSeq = 0
/** Yêu cầu giữ chỗ đang chờ server trả lời (để nhả chỗ sau khi nó xong) */
let pendingHold: Promise<unknown> | null = null
/**
 * Sự kiện từ nhiều instance server có thể tới lệch thứ tự: nhớ phiên bản mới
 * nhất của từng lịch và các hold đã bị xoá để bỏ qua sự kiện cũ tới muộn.
 */
const latestBookingVersion = new Map<string, number>()
const removedHolds = new Set<string>()

// ------------------------------------------------------------------- store

function setState(update: Partial<RealtimeState> | ((s: RealtimeState) => Partial<RealtimeState>)) {
  const patch = typeof update === 'function' ? update(state) : update
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getState(): RealtimeState {
  return state
}

export function onRealtimeEvent(fn: (e: RealtimeEvent) => void): () => void {
  eventListeners.add(fn)
  return () => eventListeners.delete(fn)
}

function emitEvent(e: RealtimeEvent) {
  for (const fn of eventListeners) fn(e)
}

const emptyDay = (): DayState => ({ loaded: false, bookings: {}, holds: {}, changed: {} })

function sortMine(list: Booking[]): Booking[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
}

function setMine(mine: Booking[]) {
  setState({ mine })
  if (currentUser) void writeJson(mineCacheKey(currentUser.id), mine)
}

// ----------------------------------------------------------- áp dụng sự kiện

function applyBooking(b: Booking) {
  if ((latestBookingVersion.get(b.id) ?? -1) > b.updatedAt) return
  latestBookingVersion.set(b.id, b.updatedAt)
  setState((s) => {
    const patch: Partial<RealtimeState> = {}
    const day = s.days[b.date]
    if (day) {
      const bookings = { ...day.bookings }
      if (isBlocking(b)) bookings[b.id] = b
      else delete bookings[b.id]
      const changed = b.userId === currentUser?.id ? day.changed : { ...day.changed, [b.id]: Date.now() }
      patch.days = { ...s.days, [b.date]: { ...day, bookings, changed } }
    }
    if (s.mine && b.userId === currentUser?.id) {
      const others = s.mine.filter((x) => x.id !== b.id)
      patch.mine = sortMine([...others, b])
    }
    return patch
  })
  if (b.userId === currentUser?.id && state.mine) void writeJson(mineCacheKey(b.userId), state.mine)
}

function applyHold(h: Hold) {
  if (removedHolds.has(h.id)) return
  setState((s) => {
    const patch: Partial<RealtimeState> = {}
    const day = s.days[h.date]
    if (day) {
      const changed = h.userId === currentUser?.id ? day.changed : { ...day.changed, [h.id]: Date.now() }
      patch.days = { ...s.days, [h.date]: { ...day, holds: { ...day.holds, [h.id]: h }, changed } }
    }
    if (h.userId === currentUser?.id) patch.myHold = h
    return patch
  })
}

function applyHoldRemoved(r: HoldRemoved) {
  removedHolds.add(r.id)
  const wasMine = state.myHold?.id === r.id
  setState((s) => {
    const patch: Partial<RealtimeState> = {}
    const day = s.days[r.date]
    if (day && day.holds[r.id]) {
      const holds = { ...day.holds }
      delete holds[r.id]
      patch.days = { ...s.days, [r.date]: { ...day, holds } }
    }
    if (s.myHold?.id === r.id) patch.myHold = null
    return patch
  })
  // 'replaced' = chính mình vừa chọn khung khác, hold mới tới ngay sau — không coi là mất
  if (wasMine && (r.reason === 'expired' || r.reason === 'disconnected')) {
    emitEvent({ type: 'hold_lost', reason: r.reason })
  }
}

function applySnapshot(snapshot: DaySnapshot) {
  setState((s) => {
    const prev = s.days[snapshot.date] ?? emptyDay()
    const bookings: Record<string, Booking> = {}
    for (const b of snapshot.bookings) bookings[b.id] = b
    const holds: Record<string, Hold> = {}
    for (const h of snapshot.holds) holds[h.id] = h
    return { days: { ...s.days, [snapshot.date]: { loaded: true, bookings, holds, changed: prev.changed } } }
  })
}

// --------------------------------------------------------------- kết nối

async function fetchRooms(url: string) {
  try {
    const res = await fetch(`${url}/api/rooms`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const rooms = (await res.json()) as Room[]
    setState({ rooms, roomsError: false })
    void writeJson(ROOMS_CACHE_KEY, rooms)
  } catch {
    setState((s) => ({ roomsError: s.rooms === null }))
  }
}

async function loadDay(date: string) {
  const s = socket
  if (!s?.connected) return
  try {
    const res = await s.timeout(REQUEST_TIMEOUT_MS).emitWithAck('day:join', date)
    if (res.ok) applySnapshot(res.data)
  } catch {
    // Timeout — sẽ tải lại ở lần kết nối sau
  }
}

/** Tải lại toàn bộ dữ liệu đang xem (sau khi kết nối lại / app quay lại foreground). */
export function resync() {
  const url = state.serverUrl
  if (url) void fetchRooms(url)
  for (const date of dayRefs.keys()) void loadDay(date)
  void refreshMine()
}

export async function connect(serverUrl: string, user: User | null) {
  disconnect()
  const seq = connectSeq
  currentUser = user
  setState({ status: 'connecting', serverUrl, days: {}, mine: null, myHold: null })

  // Hiện dữ liệu cache ngay, không chờ mạng
  const cachedRooms = await readJson<Room[]>(ROOMS_CACHE_KEY)
  if (cachedRooms && !state.rooms) setState({ rooms: cachedRooms })
  if (user) {
    const cachedMine = await readJson<Booking[]>(mineCacheKey(user.id))
    if (cachedMine && !state.mine) setState({ mine: cachedMine })
  }
  if (seq !== connectSeq) return // đã có lần connect/disconnect mới trong lúc chờ cache

  const s: AppSocket = io(serverUrl, {
    path: SOCKET_PATH,
    // Không thêm "/" cuối đường dẫn (khớp với cấu hình server và rewrite của Vercel)
    addTrailingSlash: false,
    // Vercel Functions chỉ hỗ trợ websocket (không long-polling). Kết nối bị
    // đóng khi function hết thời gian tối đa -> Socket.IO tự kết nối lại.
    transports: ['websocket'],
    auth: user ? { userId: user.id, name: user.name } : {},
    reconnectionDelayMax: 5_000,
    timeout: REQUEST_TIMEOUT_MS,
  })
  socket = s

  s.on('connect', () => {
    setState({ status: 'online' })
    resync()
  })
  s.on('disconnect', () => {
    const hadHold = state.myHold !== null
    setState((st) => ({
      status: 'offline',
      myHold: null,
      days: Object.fromEntries(Object.entries(st.days).map(([d, day]) => [d, { ...day, loaded: false }])),
    }))
    // Server nhả hold khi socket ngắt — báo cho màn hình đang chọn giờ
    if (hadHold) emitEvent({ type: 'hold_lost', reason: 'disconnected' })
  })
  s.on('connect_error', () => setState({ status: 'offline' }))
  s.on('presence', (p) => setState({ online: p.online }))
  s.on('booking:upsert', applyBooking)
  s.on('hold:upsert', applyHold)
  s.on('hold:remove', applyHoldRemoved)
  s.on('notice', (notice) => emitEvent({ type: 'notice', notice }))
}

export function disconnect() {
  connectSeq++
  socket?.removeAllListeners()
  socket?.disconnect()
  socket = null
  setState({ status: 'idle' })
}

/** Thử kết nối lại ngay (khi có mạng trở lại / app quay lại foreground). */
export function reconnectNow() {
  if (socket && !socket.connected) socket.connect()
}

/**
 * Thiết bị báo mất mạng: chủ động ngắt socket thay vì chờ timeout — WebSocket
 * cũ có thể "treo" một lúc lâu trước khi bị phát hiện là đã chết.
 */
export function goOffline() {
  if (!socket) return
  // Đang kết nối dở thì disconnect() dừng các lần thử lại; reconnectNow() mở lại khi có mạng
  const wasConnected = socket.connected
  socket.disconnect()
  if (!wasConnected) setState({ status: 'offline' })
}

/** Theo dõi một ngày. Trả về hàm huỷ theo dõi. */
export function watchDay(date: string): () => void {
  const refs = dayRefs.get(date) ?? 0
  dayRefs.set(date, refs + 1)
  if (refs === 0) {
    if (!state.days[date]) setState((s) => ({ days: { ...s.days, [date]: emptyDay() } }))
    void loadDay(date)
  }
  return () => {
    const left = (dayRefs.get(date) ?? 1) - 1
    if (left > 0) {
      dayRefs.set(date, left)
      return
    }
    dayRefs.delete(date)
    socket?.emit('day:leave', date)
    // Giữ dữ liệu để quay lại không bị nháy trắng, nhưng đánh dấu có thể đã cũ
    setState((s) => (s.days[date] ? { days: { ...s.days, [date]: { ...s.days[date], loaded: false } } } : {}))
  }
}

// ----------------------------------------------------------------- lệnh

function networkError<T>(): Result<T> {
  return { ok: false, error: { code: 'NETWORK', message: ERROR_MESSAGES.NETWORK } }
}

async function call<T>(send: (s: AppSocket) => Promise<Result<T>>): Promise<Result<T>> {
  const s = socket
  if (!s?.connected) return networkError()
  try {
    return await send(s.timeout(REQUEST_TIMEOUT_MS) as unknown as AppSocket)
  } catch {
    return networkError()
  }
}

export async function refreshMine(): Promise<void> {
  if (!currentUser) return
  const res = await call((s) => s.emitWithAck('mine:list'))
  if (res.ok) setMine(sortMine(res.data))
}

export async function holdSlot(req: SlotRequest): Promise<Result<Hold>> {
  const request = call((s) => s.emitWithAck('hold:create', req))
  pendingHold = request
  const res = await request
  if (pendingHold === request) pendingHold = null
  if (res.ok) applyHold(res.data)
  return res
}

export async function releaseHold(): Promise<void> {
  // Người dùng bỏ chọn khi yêu cầu giữ chỗ còn đang chờ: đợi nó xong rồi mới
  // nhả, nếu không server sẽ giữ một chỗ "ma" tới khi hết hạn
  if (pendingHold) await pendingHold.catch(() => {})
  if (!state.myHold) return
  setState({ myHold: null })
  await call((s) => s.emitWithAck('hold:release'))
}

async function bookingCommand(send: (s: AppSocket) => Promise<Result<Booking>>): Promise<Result<Booking>> {
  const res = await call(send)
  if (res.ok) applyBooking(res.data)
  return res
}

export const createBooking = (req: BookingRequest) => bookingCommand((s) => s.emitWithAck('booking:create', req))
export const cancelBooking = (id: string) => bookingCommand((s) => s.emitWithAck('booking:cancel', id))
export const checkIn = (id: string) => bookingCommand((s) => s.emitWithAck('booking:checkin', id))
export const endEarly = (id: string) => bookingCommand((s) => s.emitWithAck('booking:end', id))
