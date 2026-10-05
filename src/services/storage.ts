import { Preferences } from '@capacitor/preferences'

// Lưu JSON qua Capacitor Preferences (SharedPreferences / UserDefaults trên
// native, localStorage trên web) — dùng cho phiên đăng nhập và cache offline.

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const { value } = await Preferences.get({ key })
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    if (value === null || value === undefined) await Preferences.remove({ key })
    else await Preferences.set({ key, value: JSON.stringify(value) })
  } catch {
    // Cache chỉ là phụ — lỗi ghi không được làm hỏng luồng chính
  }
}
