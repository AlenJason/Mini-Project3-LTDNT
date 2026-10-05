// Kiểu dữ liệu dùng chung giữa app (src/) và server realtime (server/).

export type RoomType = 'study' | 'lab' | 'seminar'

export type Amenity =
  | 'whiteboard'
  | 'tv'
  | 'projector'
  | 'computers'
  | 'power'
  | 'video_call'
  | 'mic'
  | 'quiet'

export interface Room {
  /** Mã phòng, đồng thời là id, ví dụ "TV-201" */
  id: string
  name: string
  type: RoomType
  building: string
  floor: number
  capacity: number
  amenities: Amenity[]
  /** Giờ mở cửa, tính bằng phút kể từ 00:00 (giờ campus) */
  openMinute: number
  /** Giờ đóng cửa, tính bằng phút kể từ 00:00 (giờ campus) */
  closeMinute: number
  description: string
}

export type BookingStatus =
  | 'confirmed' // đã đặt, chờ check-in
  | 'checked_in' // đang sử dụng
  | 'completed' // đã dùng xong (hoặc kết thúc sớm)
  | 'cancelled' // người đặt tự huỷ
  | 'no_show' // không check-in đúng hạn, hệ thống tự nhả phòng

export interface Booking {
  id: string
  roomId: string
  userId: string
  userName: string
  /** Ngày theo giờ campus, dạng YYYY-MM-DD */
  date: string
  /** Phút bắt đầu trong ngày (bội số của SLOT_MINUTES) */
  start: number
  /** Phút kết thúc trong ngày (bội số của SLOT_MINUTES) */
  end: number
  purpose: string
  attendees: number
  status: BookingStatus
  createdAt: number
  updatedAt: number
  checkedInAt?: number
  /** Giờ kết thúc ban đầu, chỉ có khi người dùng bấm "Kết thúc sớm" */
  originalEnd?: number
}

/** Giữ chỗ tạm thời trong lúc người dùng đang điền form đặt phòng */
export interface Hold {
  id: string
  roomId: string
  userId: string
  userName: string
  date: string
  start: number
  end: number
  expiresAt: number
}

export interface User {
  /** MSSV viết hoa — cùng MSSV trên nhiều thiết bị được coi là một người */
  id: string
  name: string
}

export interface SlotRequest {
  roomId: string
  date: string
  start: number
  end: number
}

export interface BookingRequest extends SlotRequest {
  purpose: string
  attendees: number
}
