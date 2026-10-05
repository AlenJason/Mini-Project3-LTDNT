import type { User } from '../../shared/types.ts'
import { readJson, writeJson } from './storage.ts'

// Đăng nhập đơn giản bằng họ tên + MSSV (bản demo, không có mật khẩu). MSSV
// là định danh: cùng MSSV trên nhiều thiết bị sẽ thấy cùng một danh sách lịch.

const SESSION_KEY = 'session-user'

export function normalizeStudentId(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

export function isValidStudentId(id: string): boolean {
  return /^[A-Z0-9]{4,20}$/.test(id)
}

export async function loadUser(): Promise<User | null> {
  const user = await readJson<User>(SESSION_KEY)
  return user && typeof user.id === 'string' && typeof user.name === 'string' ? user : null
}

export async function saveUser(user: User | null): Promise<void> {
  await writeJson(SESSION_KEY, user)
}
