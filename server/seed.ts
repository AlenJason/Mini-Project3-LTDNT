// Dữ liệu mẫu: danh sách phòng học nhóm / lab và vài lịch đặt của người dùng
// demo để màn hình không trống khi mới chạy.

import { randomUUID } from 'node:crypto'
import { CHECKIN_GRACE_MINUTES, currentSlotStart } from '../shared/rules.ts'
import { addDays, campusDate, campusMinute, toEpoch } from '../shared/time.ts'
import type { Booking, Room, User } from '../shared/types.ts'

const h = (hour: number, minute = 0) => hour * 60 + minute

export const ROOMS: Room[] = [
  {
    id: 'TV-201',
    name: 'Phòng học nhóm 1',
    type: 'study',
    building: 'Thư viện',
    floor: 2,
    capacity: 6,
    amenities: ['whiteboard', 'tv', 'power'],
    openMinute: h(7),
    closeMinute: h(21),
    description: 'Bàn tròn 6 chỗ, TV 55" có cổng HDMI để chiếu laptop.',
  },
  {
    id: 'TV-202',
    name: 'Phòng học nhóm 2',
    type: 'study',
    building: 'Thư viện',
    floor: 2,
    capacity: 4,
    amenities: ['whiteboard', 'power', 'quiet'],
    openMinute: h(7),
    closeMinute: h(21),
    description: 'Phòng nhỏ cách âm, hợp để ôn thi hoặc phỏng vấn online.',
  },
  {
    id: 'TV-203',
    name: 'Phòng học nhóm 3',
    type: 'study',
    building: 'Thư viện',
    floor: 2,
    capacity: 8,
    amenities: ['whiteboard', 'tv', 'video_call', 'power'],
    openMinute: h(7),
    closeMinute: h(21),
    description: 'Có webcam và loa hội nghị cho nhóm họp với thành viên ở xa.',
  },
  {
    id: 'TV-301',
    name: 'Phòng tự học yên tĩnh',
    type: 'study',
    building: 'Thư viện',
    floor: 3,
    capacity: 10,
    amenities: ['quiet', 'power'],
    openMinute: h(7),
    closeMinute: h(21),
    description: 'Không trao đổi, không gọi điện. Mỗi chỗ ngồi có ổ cắm riêng.',
  },
  {
    id: 'A-301',
    name: 'Lab Mạng máy tính',
    type: 'lab',
    building: 'Khu A',
    floor: 3,
    capacity: 30,
    amenities: ['computers', 'projector', 'whiteboard'],
    openMinute: h(7),
    closeMinute: h(17, 30),
    description: '30 máy cấu hình Packet Tracer, GNS3 và tủ thiết bị Cisco thực hành.',
  },
  {
    id: 'A-302',
    name: 'Lab IoT và hệ thống nhúng',
    type: 'lab',
    building: 'Khu A',
    floor: 3,
    capacity: 20,
    amenities: ['computers', 'power', 'whiteboard'],
    openMinute: h(7, 30),
    closeMinute: h(17),
    description: 'Bộ kit Arduino, ESP32, Raspberry Pi; mượn linh kiện tại quầy kỹ thuật viên.',
  },
  {
    id: 'K-105',
    name: 'Lab Mac và iOS',
    type: 'lab',
    building: 'Khu K',
    floor: 1,
    capacity: 16,
    amenities: ['computers', 'tv', 'power'],
    openMinute: h(8),
    closeMinute: h(20),
    description: '16 máy Mac cài sẵn Xcode, Android Studio — chạy được app Capacitor trên cả hai nền tảng.',
  },
  {
    id: 'B-101',
    name: 'Phòng hội thảo nhỏ',
    type: 'seminar',
    building: 'Khu B',
    floor: 1,
    capacity: 40,
    amenities: ['projector', 'mic', 'video_call'],
    openMinute: h(7),
    closeMinute: h(21),
    description: 'Dành cho sinh hoạt CLB, bảo vệ đồ án, seminar nhóm nghiên cứu.',
  },
]

export const DEMO_USERS: User[] = [
  { id: 'DEMO01', name: 'Trần Minh Khoa' },
  { id: 'DEMO02', name: 'Lê Thu Hà' },
  { id: 'DEMO03', name: 'Phạm Gia Bảo' },
  { id: 'DEMO04', name: 'Võ Ngọc Anh' },
  { id: 'DEMO05', name: 'Đặng Quốc Huy' },
  { id: 'DEMO06', name: 'Ngô Bảo Trâm' },
  // Người dùng "hay quên": không bao giờ check-in -> minh hoạ tự nhả phòng
  { id: 'DEMO07', name: 'Huỳnh Đức Tài' },
]

export const FORGETFUL_USER_ID = 'DEMO07'

export function isDemoUser(userId: string): boolean {
  return userId.startsWith('DEMO')
}

interface Template {
  roomId: string
  userIndex: number
  start: number
  end: number
  purpose: string
  attendees: number
}

function makeBooking(date: string, t: Template, status: Booking['status'], now: number): Booking {
  const user = DEMO_USERS[t.userIndex]
  return {
    id: randomUUID(),
    roomId: t.roomId,
    userId: user.id,
    userName: user.name,
    date,
    start: t.start,
    end: t.end,
    purpose: t.purpose,
    attendees: t.attendees,
    status,
    createdAt: now,
    updatedAt: now,
    checkedInAt: status === 'checked_in' || status === 'completed' ? toEpoch(date, t.start) : undefined,
  }
}

/**
 * Sinh lịch demo cho hôm nay (quanh thời điểm hiện tại, để luôn có phòng đang
 * dùng / sắp có lịch) và ngày mai.
 */
export function demoBookings(now: number = Date.now()): Booking[] {
  const today = campusDate(now)
  const nowMinute = campusMinute(now)
  const slot = currentSlotStart(nowMinute)
  const result: Booking[] = []

  const todayTemplates: Template[] = [
    { roomId: 'TV-301', userIndex: 5, start: slot - 120, end: slot - 60, purpose: 'Tự học', attendees: 1 },
    { roomId: 'TV-201', userIndex: 0, start: slot - 60, end: slot + 30, purpose: 'Ôn thi Cấu trúc dữ liệu', attendees: 5 },
    { roomId: 'A-301', userIndex: 2, start: slot - 30, end: slot + 90, purpose: 'Thực hành cấu hình VLAN', attendees: 18 },
    { roomId: 'TV-203', userIndex: 6, start: slot + 30, end: slot + 90, purpose: 'Họp nhóm đồ án', attendees: 4 },
    { roomId: 'TV-202', userIndex: 1, start: slot + 60, end: slot + 120, purpose: 'Luyện phỏng vấn', attendees: 2 },
    { roomId: 'K-105', userIndex: 3, start: slot + 90, end: slot + 180, purpose: 'Build app iOS', attendees: 6 },
    { roomId: 'B-101', userIndex: 4, start: slot + 120, end: slot + 240, purpose: 'Sinh hoạt CLB Lập trình', attendees: 25 },
  ]

  const roomById = new Map(ROOMS.map((r) => [r.id, r]))
  for (const t of todayTemplates) {
    const room = roomById.get(t.roomId)
    if (!room || t.start < room.openMinute || t.end > room.closeMinute) continue
    let status: Booking['status'] = 'confirmed'
    if (t.end <= nowMinute) status = 'completed'
    else if (t.start <= nowMinute) {
      // Người "hay quên" đã quá hạn check-in thì bỏ qua — không seed lịch no-show
      if (DEMO_USERS[t.userIndex].id === FORGETFUL_USER_ID) {
        if (nowMinute > t.start + CHECKIN_GRACE_MINUTES) continue
      } else status = 'checked_in'
    }
    result.push(makeBooking(today, t, status, now))
  }

  const tomorrow = addDays(today, 1)
  const tomorrowTemplates: Template[] = [
    { roomId: 'A-301', userIndex: 2, start: h(7, 30), end: h(9, 30), purpose: 'Thực hành định tuyến OSPF', attendees: 22 },
    { roomId: 'B-101', userIndex: 5, start: h(8), end: h(10), purpose: 'Bảo vệ đồ án cơ sở', attendees: 30 },
    { roomId: 'TV-201', userIndex: 1, start: h(9), end: h(11), purpose: 'Học nhóm Xác suất thống kê', attendees: 5 },
    { roomId: 'K-105', userIndex: 0, start: h(13), end: h(15), purpose: 'Làm đồ án Capacitor', attendees: 4 },
    { roomId: 'TV-203', userIndex: 4, start: h(14), end: h(15, 30), purpose: 'Họp online với giảng viên', attendees: 3 },
  ]
  for (const t of tomorrowTemplates) result.push(makeBooking(tomorrow, t, 'confirmed', now))

  return result
}
