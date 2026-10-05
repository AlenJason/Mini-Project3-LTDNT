import { CalendarCheck, DoorOpen, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { isActive } from '../../shared/rules.ts'
import { useRealtime } from '../hooks/useRealtime.ts'

export function TabBar() {
  const mine = useRealtime((s) => s.mine)
  const activeCount = mine ? mine.filter(isActive).length : 0

  return (
    <nav className="tabbar" aria-label="Điều hướng chính">
      <NavLink to="/" end className="tabbar__item">
        <DoorOpen size={22} aria-hidden />
        <span>Phòng</span>
      </NavLink>
      <NavLink to="/bookings" className="tabbar__item">
        <span className="tabbar__icon">
          <CalendarCheck size={22} aria-hidden />
          {activeCount > 0 && (
            <span className="tabbar__badge" aria-label={`${activeCount} lịch sắp tới`}>
              {activeCount}
            </span>
          )}
        </span>
        <span>Lịch của tôi</span>
      </NavLink>
      <NavLink to="/profile" className="tabbar__item">
        <UserRound size={22} aria-hidden />
        <span>Cá nhân</span>
      </NavLink>
    </nav>
  )
}
