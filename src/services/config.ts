import { Capacitor } from '@capacitor/core'
import { readJson, writeJson } from './storage.ts'

const SERVER_URL_KEY = 'server-url'
const SERVER_PORT = 4000

/** Địa chỉ server mặc định khi người dùng chưa tự đặt trong app. */
export function defaultServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL?.trim()
  if (fromEnv) return fromEnv
  if (Capacitor.isNativePlatform()) {
    // 10.0.2.2 là "localhost của máy tính" khi nhìn từ Android emulator
    return Capacitor.getPlatform() === 'android'
      ? `http://10.0.2.2:${SERVER_PORT}`
      : `http://localhost:${SERVER_PORT}`
  }
  // Web dev (Vite) -> server cùng máy, cổng 4000; mở bằng IP LAN trên điện
  // thoại thì vẫn trỏ đúng máy tính đang chạy server.
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`
  return window.location.origin
}

export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withScheme)
    return url.origin
  } catch {
    return null
  }
}

export async function loadServerUrl(): Promise<string> {
  return (await readJson<string>(SERVER_URL_KEY)) ?? defaultServerUrl()
}

/** Lưu địa chỉ server tuỳ chỉnh; truyền null để quay về mặc định. */
export async function saveServerUrl(url: string | null): Promise<string> {
  await writeJson(SERVER_URL_KEY, url)
  return url ?? defaultServerUrl()
}
