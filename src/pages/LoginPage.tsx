import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext.tsx'
import { isValidStudentId, normalizeStudentId } from '../services/session.ts'

export function LoginPage() {
  const { user, login } = useSession()
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim().replace(/\s+/g, ' ')
    const id = normalizeStudentId(studentId)
    if (trimmedName.length < 2) return setError('Nhập họ và tên để mọi người biết ai đang dùng phòng.')
    if (!isValidStudentId(id)) return setError('MSSV gồm 4–20 chữ cái hoặc chữ số, ví dụ 23IT257.')
    await login({ id, name: trimmedName })
  }

  return (
    <main className="login">
      <div className="login__brand">
        <p className="login__app">Đặt Phòng VKU</p>
        <h1 className="login__headline">Tìm phòng trống, giữ chỗ trong một chạm.</h1>
        <p className="login__lede">
          Phòng học nhóm ở thư viện và phòng lab, cập nhật theo thời gian thực. Ai vừa đặt, bạn thấy ngay.
        </p>
        <div className="login__sample" aria-hidden>
          <span className="login__sample-seg login__sample-seg--taken" />
          <span className="login__sample-seg login__sample-seg--mine" />
          <span className="login__sample-seg login__sample-seg--held" />
          <span className="login__sample-now" />
        </div>
      </div>

      <form className="login__form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">Họ và tên</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Nguyễn Văn An"
          />
        </label>
        <label className="field">
          <span className="field__label">Mã số sinh viên</span>
          <input
            className="input input--code"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            autoCapitalize="characters"
            autoComplete="username"
            placeholder="23IT257"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button--primary button--block">
          Vào đặt phòng
        </button>
        <p className="login__note">
          Bản demo không cần mật khẩu. Đăng nhập cùng MSSV trên điện thoại khác để thấy lịch của bạn đồng bộ.
        </p>
      </form>
    </main>
  )
}
