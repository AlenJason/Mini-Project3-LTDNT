import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Cho phép điện thoại cùng mạng LAN mở bản dev
    host: true,
  },
})
