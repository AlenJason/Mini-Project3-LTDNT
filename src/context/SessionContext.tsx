import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { App } from '@capacitor/app'
import { Network } from '@capacitor/network'
import type { User } from '../../shared/types.ts'
import { loadServerUrl, saveServerUrl } from '../services/config.ts'
import { loadUser, saveUser } from '../services/session.ts'
import { connect, disconnect, goOffline, reconnectNow, resync } from '../store/realtime.ts'

interface Session {
  ready: boolean
  user: User | null
  serverUrl: string
  login: (user: User) => Promise<void>
  logout: () => Promise<void>
  /** null = quay về địa chỉ mặc định */
  changeServerUrl: (url: string | null) => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [serverUrl, setServerUrl] = useState('')

  useEffect(() => {
    Promise.all([loadUser(), loadServerUrl()]).then(([u, url]) => {
      setUser(u)
      setServerUrl(url)
      setReady(true)
    })
  }, [])

  // (Re)connect mỗi khi đổi người dùng hoặc đổi server
  useEffect(() => {
    if (!ready) return
    void connect(serverUrl, user)
    return () => disconnect()
  }, [ready, serverUrl, user])

  // App quay lại foreground / có mạng trở lại -> kết nối lại và tải lại dữ liệu
  useEffect(() => {
    const resume = App.addListener('resume', () => {
      reconnectNow()
      resync()
    })
    const network = Network.addListener('networkStatusChange', (s) => {
      if (s.connected) reconnectNow()
      else goOffline()
    })
    return () => {
      void resume.then((h) => h.remove())
      void network.then((h) => h.remove())
    }
  }, [])

  const login = useCallback(async (next: User) => {
    await saveUser(next)
    setUser(next)
  }, [])

  const logout = useCallback(async () => {
    await saveUser(null)
    setUser(null)
  }, [])

  const changeServerUrl = useCallback(async (url: string | null) => {
    setServerUrl(await saveServerUrl(url))
  }, [])

  const value = useMemo(
    () => ({ ready, user, serverUrl, login, logout, changeServerUrl }),
    [ready, user, serverUrl, login, logout, changeServerUrl],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession phải nằm trong <SessionProvider>')
  return ctx
}
