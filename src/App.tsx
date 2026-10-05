import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { RealtimeNotices } from './components/RealtimeNotices.tsx'
import { TabBar } from './components/TabBar.tsx'
import { SessionProvider, useSession } from './context/SessionContext.tsx'
import { ToastProvider } from './context/ToastContext.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { MyBookingsPage } from './pages/MyBookingsPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { RoomDetailPage } from './pages/RoomDetailPage.tsx'
import { RoomDisplayPage } from './pages/RoomDisplayPage.tsx'
import { RoomsPage } from './pages/RoomsPage.tsx'
import './App.css'

function WaitForSession({ children }: { children: ReactNode }) {
  const { ready } = useSession()
  return ready ? children : <div className="splash" aria-busy="true" />
}

function RequireUser() {
  const { user } = useSession()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="app-shell">
      <Outlet />
      <TabBar />
      <RealtimeNotices />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <BrowserRouter>
          <WaitForSession>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* Màn hình trước cửa phòng — không cần đăng nhập */}
              <Route path="/display/:roomId" element={<RoomDisplayPage />} />
              <Route element={<RequireUser />}>
                <Route index element={<RoomsPage />} />
                <Route path="/rooms/:roomId" element={<RoomDetailPage />} />
                <Route path="/bookings" element={<MyBookingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </WaitForSession>
        </BrowserRouter>
      </SessionProvider>
    </ToastProvider>
  )
}
