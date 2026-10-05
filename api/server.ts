// Vercel Function: REST API (/api/rooms, /api/health) và Socket.IO (/api/socket.io).
// vercel.json chuyển mọi request /api/* về function này.
// https://vercel.com/docs/functions/websockets

import { createRealtimeServer } from '../server/realtime.ts'

const { httpServer } = await createRealtimeServer()

export default httpServer
