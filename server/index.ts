// Chạy server realtime ở máy local: npm run server  (Node >= 22.18 — chạy thẳng file .ts)
// Trên Vercel, cùng server này được export từ api/server.ts.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createRealtimeServer } from './realtime.ts'

const PORT = Number(process.env.PORT ?? 4000)

const { app, httpServer } = await createRealtimeServer()

// Phục vụ luôn bản build web (npm run build) để chạy local chỉ cần một tiến trình
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile('index.html', { root: distDir })
  })
}

httpServer.listen(PORT, () => {
  const storage = process.env.REDIS_URL || process.env.KV_URL ? 'Redis' : 'bộ nhớ + server/data.json'
  console.log(`[server] Đặt Phòng VKU realtime đang chạy ở http://localhost:${PORT} (lưu trữ: ${storage})`)
})
