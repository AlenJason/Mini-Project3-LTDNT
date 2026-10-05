import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

type ShowToast = (message: string, variant?: ToastVariant) => void

const ToastContext = createContext<ShowToast | null>(null)
const DURATION_MS = 4_500
let nextId = 1

const ICONS = { success: CircleCheck, error: TriangleAlert, info: Info }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback<ShowToast>(
    (message, variant = 'info') => {
      const id = nextId++
      // Tối đa 3 thông báo cùng lúc, bỏ thông báo cũ nhất
      setItems((list) => [...list.slice(-2), { id, message, variant }])
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.variant]
          return (
            <div key={t.id} className={`toast toast--${t.variant}`}>
              <Icon size={18} aria-hidden />
              <p>{t.message}</p>
              <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast phải nằm trong <ToastProvider>')
  return ctx
}
