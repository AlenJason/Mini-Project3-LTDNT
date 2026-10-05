import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.vku.roombooking',
  appName: 'Đặt Phòng VKU',
  webDir: 'dist',
  android: {
    // Server realtime demo chạy HTTP trong mạng LAN (http://192.168.x.x:4000),
    // trong khi WebView Android tải app qua https://localhost — cần cho phép
    // mixed content để Socket.IO kết nối được.
    allowMixedContent: true,
  },
  server: {
    // Bật cleartext (android:usesCleartextTraffic) cho server HTTP demo.
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#2E8B5E',
    },
  },
}

export default config
