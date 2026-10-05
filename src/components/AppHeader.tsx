import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ConnectionBanner } from './ConnectionBanner.tsx'
import { LiveIndicator } from './LiveIndicator.tsx'

interface Props {
  title: string
  /** Hiện nút quay lại */
  back?: boolean
  children?: ReactNode
}

export function AppHeader({ title, back, children }: Props) {
  const navigate = useNavigate()
  return (
    <header className="app-header">
      <div className="app-header__bar">
        {back && (
          <button
            type="button"
            className="icon-button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            aria-label="Quay lại"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <h1 className="app-header__title">{title}</h1>
        <LiveIndicator />
      </div>
      {children}
      <ConnectionBanner />
    </header>
  )
}
