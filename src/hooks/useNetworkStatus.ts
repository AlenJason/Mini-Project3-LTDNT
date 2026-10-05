import { useEffect, useState } from 'react'
import { Network } from '@capacitor/network'

/** true khi thiết bị có kết nối mạng (Capacitor Network plugin). */
export function useNetworkStatus(): boolean {
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    let cancelled = false
    Network.getStatus()
      .then((s) => !cancelled && setConnected(s.connected))
      .catch(() => {})
    const handle = Network.addListener('networkStatusChange', (s) => setConnected(s.connected))
    return () => {
      cancelled = true
      void handle.then((h) => h.remove())
    }
  }, [])

  return connected
}
