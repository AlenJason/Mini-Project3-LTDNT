import {
  Mic,
  Monitor,
  PlugZap,
  Presentation,
  Projector,
  Tv,
  Video,
  VolumeX,
  type LucideIcon,
} from 'lucide-react'
import { SLOT_MINUTES, isBlocking } from '../../shared/rules.ts'
import { formatMinute } from '../../shared/time.ts'
import type { Amenity, Booking, Hold, Room, RoomType } from '../../shared/types.ts'

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  study: 'Phòng học nhóm',
  lab: 'Phòng lab',
  seminar: 'Hội thảo',
}

export const AMENITIES: Record<Amenity, { label: string; icon: LucideIcon }> = {
  whiteboard: { label: 'Bảng trắng', icon: Presentation },
  tv: { label: 'Màn hình TV', icon: Tv },
  projector: { label: 'Máy chiếu', icon: Projector },
  computers: { label: 'Máy tính', icon: Monitor },
  power: { label: 'Ổ cắm', icon: PlugZap },
  video_call: { label: 'Họp trực tuyến', icon: Video },
  mic: { label: 'Micro', icon: Mic },
  quiet: { label: 'Yên tĩnh', icon: VolumeX },
}

/** Trục thời gian chung cho mọi phòng trên màn danh sách */
export const AXIS_START = 7 * 60
export const AXIS_END = 21 * 60

export function roomLocation(room: Room): string {
  return `${room.building}, tầng ${room.floor}`
}

/** "Trần Minh Khoa" -> "Khoa" */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] ?? fullName
}

export interface RoomNow {
  kind: 'free' | 'busy' | 'held' | 'closed'
  label: string
  /** Trạng thái hiện tại kéo dài tới phút này (nếu biết) */
  until?: number
}

/** Trạng thái hiện tại của phòng (chỉ dùng cho ngày hôm nay). */
export function roomStatusNow(room: Room, bookings: Booking[], holds: Hold[], nowMinute: number): RoomNow {
  if (nowMinute < room.openMinute) return { kind: 'closed', label: `Mở cửa lúc ${formatMinute(room.openMinute)}` }
  if (nowMinute >= room.closeMinute) return { kind: 'closed', label: 'Đã đóng cửa' }

  const blocking = bookings.filter((b) => b.roomId === room.id && isBlocking(b)).sort((a, b) => a.start - b.start)
  const current = blocking.find((b) => b.start <= nowMinute && nowMinute < b.end)
  if (current) {
    // Gộp các lịch nối tiếp nhau để biết khi nào phòng thật sự trống
    let until = current.end
    for (const b of blocking) if (b.start === until) until = b.end
    return { kind: 'busy', label: `Đang dùng đến ${formatMinute(until)}`, until }
  }
  if (holds.some((h) => h.roomId === room.id && h.start <= nowMinute && nowMinute < h.end)) {
    return { kind: 'held', label: 'Có người đang giữ chỗ' }
  }
  const next = blocking.find((b) => b.start > nowMinute)
  const until = next ? next.start : room.closeMinute
  return { kind: 'free', label: `Trống đến ${formatMinute(until)}`, until }
}

/** Số khung 30 phút còn trống (chưa qua, chưa ai đặt / giữ). */
export function freeSlotCount(room: Room, starts: number[], bookings: Booking[], holds: Hold[], fromMinute: number): number {
  let count = 0
  for (const s of starts) {
    if (s < fromMinute) continue
    const end = s + SLOT_MINUTES
    const taken =
      bookings.some((b) => b.roomId === room.id && isBlocking(b) && b.start < end && s < b.end) ||
      holds.some((h) => h.roomId === room.id && h.start < end && s < h.end)
    if (!taken) count++
  }
  return count
}
