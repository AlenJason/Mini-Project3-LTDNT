# MINI-PROJECT SHORT TECHNICAL REPORT
**Course:** Cross-Platform Mobile App Development (VKU)
**Mini-Project Title:** Project 2 — Đặt Phòng Học/Lab Realtime (Robin/LibCal) — Capacitor
**Team / Student Name:** Nguyễn Thiên
**Submission Date:** 05/10/2026

---

## 1. GENERAL INFORMATION & DELIVERABLE LINKS
* **Team Members:**
  1. Nguyễn Thiên — Student ID: 23IT257 — Role: Sole Developer (Full-stack Mobile) — Contribution: 100%
* **🔗 Live Demo URL:** https://mini-project3-ltdnt.vercel.app — bản Web cùng server realtime (Socket.IO trên Vercel Functions, dữ liệu trong Upstash Redis). Mở bằng hai trình duyệt / hai điện thoại, đăng nhập hai MSSV khác nhau để thấy cập nhật realtime. Màn hình trước cửa phòng: https://mini-project3-ltdnt.vercel.app/display/TV-201. Bản native (Android/iOS) chạy qua `npm run cap:android` / `npm run cap:ios` — xem `README.md`.
* **💻 GitHub Repository:** https://github.com/AlenJason/Mini-Project3-LTDNT
* **🎥 Video Demo (Optional):** Không có.

> Đề bài ghi "React Native"; bản này được hiện thực bằng **React + Capacitor** (cùng hướng với Project 1.2) — một codebase chạy Web, Android, iOS.

---

## 2. FEATURE IMPLEMENTATION CHECKLIST
| # | Required Feature | Status | Implementation Details & Acceptance Level |
|:---:|---|:---:|---|
| 1 | Danh sách phòng học / lab và trạng thái hiện tại | ✅ Complete | 8 phòng (học nhóm, lab, hội thảo) với sức chứa, tiện ích, giờ mở cửa. Mỗi phòng có dải lịch 07:00–21:00, vạch "bây giờ", nhãn *Trống đến …* / *Đang dùng đến …*. Lọc theo loại phòng, "Trống bây giờ", chọn ngày trong 7 ngày tới. |
| 2 | Cập nhật realtime giữa nhiều người dùng | ✅ Complete | Socket.IO: mỗi màn hình join room `day:<ngày>`, server đẩy `booking:upsert` / `hold:upsert` / `hold:remove` tới mọi thiết bị đang xem. Ô vừa đổi nháy để báo. Đã kiểm tra với 2 phiên trình duyệt độc lập và trình duyệt ↔ Android emulator. |
| 3 | Đặt phòng theo khung giờ, chống đặt trùng | ✅ Complete | Lưới khung 30 phút, tối đa 2 giờ / lượt. Server kiểm tra trùng lịch, trùng chỗ đang giữ, trùng lịch của chính mình ở phòng khác, giới hạn 3 lịch chưa dùng, giờ mở cửa, ngày đặt trước. Hai người đặt cùng lúc: chỉ một người thành công, người kia nhận `SLOT_TAKEN`. |
| 4 | Giữ chỗ tạm thời khi đang đặt (LibCal) | ✅ Complete | Chọn giờ là giữ chỗ 2 phút, có thanh đếm ngược trong form; người khác thấy khung *Có người đang giữ chỗ* và không chọn được. Tự nhả khi hết hạn, rời trang hoặc mất kết nối. |
| 5 | Check-in, tự nhả phòng khi không đến (Robin) | ✅ Complete | Check-in mở trước giờ bắt đầu 10 phút; quá 15 phút đầu chưa check-in thì server tự chuyển `no_show`, nhả phòng realtime và gửi thông báo cho người đặt. Có **Trả phòng sớm** để nhả phần thời gian còn lại. |
| 6 | Lịch của tôi, huỷ lịch, đồng bộ đa thiết bị | ✅ Complete | Tab *Sắp tới* / *Đã qua*, đếm ngược hạn check-in, huỷ cần bấm hai lần. Đăng nhập cùng MSSV trên nhiều máy: thao tác ở máy này, máy kia cập nhật ngay (room `user:<MSSV>`). |
| 7 | Nhắc lịch (thông báo) | ✅ Complete | `@capacitor/local-notifications`: nhắc lúc mở check-in và 5 phút trước khi hết hạn, tự huỷ nhắc khi lịch bị huỷ / đã check-in. Trên web nhắc bằng thông báo trong app. |
| 8 | Hoạt động khi mất mạng | ✅ Complete | Cache danh sách phòng và lịch của tôi bằng `@capacitor/preferences`; `@capacitor/network` hiện banner offline, khoá thao tác đặt, chủ động ngắt socket và tự kết nối lại + tải lại snapshot khi có mạng hoặc khi app quay lại foreground (`@capacitor/app`). |
| 9 | Màn hình trước cửa phòng (Room Display) | ✅ Complete | `/display/:mã-phòng`: nền xanh / đỏ / cam theo trạng thái, đồng hồ, người đang dùng, đã check-in hay chưa, lịch tiếp theo. Không cần đăng nhập. |
| 10 | Responsive mobile, light/dark mode | ✅ Complete | Mobile-first (tối đa 480px), kiểm tra ở 390×844, tự đổi theo `prefers-color-scheme`, font tiếng Việt đóng gói offline. |

---

## 3. TECHNICAL ARCHITECTURE & PROJECT STRUCTURE

**Stack:** React 19 + TypeScript + Vite, đóng gói bằng Capacitor 8. Server realtime: Node.js + Express 5 + Socket.IO 4. Deploy: Vercel — web là file tĩnh, server là một Vercel Function (`api/server.ts`, WebSocket trên Fluid Compute, region Singapore), dữ liệu lưu trong Upstash Redis (Vercel Marketplace, gói Free). Chạy local thì server chạy thẳng TypeScript bằng type stripping của Node và lưu dữ liệu trong bộ nhớ + file JSON.

**Cấu trúc thư mục chính:**
```
shared/            Dùng chung client + server
  types.ts           Room, Booking, Hold, User
  rules.ts           Quy định đặt phòng + validateSlot, bookingPhase (check-in 10/15 phút)
  time.ts            Giờ campus cố định UTC+7
  protocol.ts        Kiểu sự kiện Socket.IO, Result<T>
server/
  index.ts           Express (REST /api/rooms, phục vụ bản build) + Socket.IO
  realtime.ts        Express + Socket.IO (+ Redis adapter khi có REDIS_URL)
  engine.ts          Mỗi thao tác: nạp state -> BookingService -> ghi compare-and-set, xung đột thì thử lại
  bookingService.ts  Quy tắc nghiệp vụ: giữ chỗ, đặt, huỷ, check-in, trả phòng sớm, sweep no-show
  store.ts           MemoryStore (local, file JSON) / RedisStore (Vercel, script Lua CAS)
  demoBots.ts        Người dùng demo tự đặt / huỷ / check-in
  seed.ts            Dữ liệu mẫu
api/server.ts        Vercel Function: export http.Server của realtime.ts
vercel.json          Build Vite, chuyển /api/* về function, region sin1
src/
  store/realtime.ts  Store realtime (useSyncExternalStore): socket, snapshot theo ngày, cache offline
  services/          config, session, storage (Preferences), notifications, haptics
  pages/             Login, Rooms, RoomDetail, MyBookings, Profile, RoomDisplay
  components/        DateStrip, DayTimeline, SlotGrid, BookingSheet, BookingCard, ConnectionBanner, …
android/, ios/       Project native do Capacitor sinh ra
```

**Quản lý trạng thái:** Một store realtime dạng module (không dùng Redux/Zustand) đọc qua `useSyncExternalStore`. Store giữ dữ liệu theo ngày (`days[date]`), "lịch của tôi" và chỗ đang giữ; màn hình nào cần ngày nào thì `watchDay(date)` (đếm tham chiếu, join/leave room Socket.IO tương ứng). Mọi lệnh gửi qua `emitWithAck` có timeout 10 giây và trả về `Result<T>` thống nhất, nên UI chỉ cần xử lý `ok` / `error.message`.

**Chống đặt trùng:** Server là nguồn sự thật duy nhất, kể cả khi Vercel chạy nhiều instance. Mỗi thao tác nạp toàn bộ state từ Redis, chạy `BookingService` (hoàn toàn đồng bộ), rồi ghi lại bằng một script Lua compare-and-set: nếu instance khác đã ghi trước thì phiên bản đã đổi, thao tác được nạp lại và chạy lại. Sự kiện realtime chỉ được phát sau khi ghi thành công, và Socket.IO Redis adapter chuyển chúng tới client đang kết nối ở mọi instance. Lớp giữ chỗ 2 phút ngăn hai người cùng điền form cho một khung giờ ngay từ đầu.

**Chiến lược xử lý ngoại lệ:**
- Mọi đầu vào từ client được kiểm tra lại ở server (kiểu dữ liệu, ngày hợp lệ, bội số 30 phút, độ dài mục đích, sức chứa); handler bọc `try/catch` và luôn trả ack.
- Mỗi mã lỗi có thông báo tiếng Việt cụ thể kèm cách xử lý (ví dụ *"Bạn đã có 3 lịch chưa sử dụng. Huỷ bớt một lịch để đặt thêm."*).
- Mất mạng hoặc server không phản hồi: lệnh trả `NETWORK` sau timeout thay vì treo; UI khoá thao tác đặt, vẫn xem được dữ liệu cache.
- Gọi plugin native (thông báo, rung) đều bọc `try/catch` và tự bỏ qua trên web.

**Kiểm thử:** 34 unit test (`node --test`) cho giờ campus, quy định đặt phòng, `BookingService` (trùng lịch, giữ chỗ, hết hạn, mất kết nối, check-in sớm / trễ, no-show, trả phòng sớm) và `BookingEngine` (8 người ở 4 instance cùng đặt một khung → đúng 1 người thành công). Kiểm thử end-to-end trên bản production bằng Chrome DevTools (2 người dùng độc lập) và script 6 client đặt đồng thời; bản native kiểm tra trên Android emulator (APK debug).

---

## 4. EMPIRICAL EVIDENCE & SCREENSHOTS

*(Ảnh 1–8 chụp từ bản production https://mini-project3-ltdnt.vercel.app, viewport 390×844, xem lịch ngày 06/10; ảnh 9 chụp từ Android emulator)*

**Ảnh 1 — Đăng nhập** (`docs/screenshots/01-login.png`)
Họ tên + MSSV; MSSV là định danh để đồng bộ lịch giữa các thiết bị.

**Ảnh 2 — Danh sách phòng realtime** (`docs/screenshots/02-rooms.png`)
Số phòng đang trống, dải lịch từng phòng với vạch "bây giờ", lọc theo loại phòng.

**Ảnh 3 — Người dùng A đang chọn giờ** (`docs/screenshots/03-selecting-hold.png`)
Khung 15:00–16:00 phòng TV-201 tô vàng, thanh dưới báo *đang giữ chỗ cho bạn*.

**Ảnh 4 — Người dùng B thấy ngay khung đang bị giữ** (`docs/screenshots/04-held-by-other-user.png`)
Khung sọc cam *Có người đang giữ chỗ*, không chọn được.

**Ảnh 5 — Form đặt phòng** (`docs/screenshots/05-booking-sheet.png`)
Đếm ngược thời gian giữ chỗ, chọn mục đích, số người (giới hạn theo sức chứa).

**Ảnh 6 — Lịch của tôi** (`docs/screenshots/06-my-bookings.png`)
Hai lịch sắp tới (lab K-105 và phòng TV-201) với thời gian còn lại và giờ mở check-in.

**Ảnh 7 — Màn hình trước cửa phòng** (`docs/screenshots/07-room-display.png`)
Ngoài giờ mở cửa: báo giờ mở lại và lịch ngày mai của phòng, cập nhật realtime (lịch 15:00 vừa đặt ở ảnh 5 xuất hiện ngay). Trong giờ mở cửa, màn hình chuyển xanh *Trống* / đỏ *Đang sử dụng* kèm người đang dùng.

**Ảnh 8 — Offline** (`docs/screenshots/08-offline.png`)
Banner mất mạng, trạng thái *Mất kết nối*, vẫn xem được dữ liệu đã tải.

**Ảnh 9 — Bản native Android đồng bộ với trình duyệt** (`docs/screenshots/09-android-native-sync.png`)
Đăng nhập cùng MSSV trên emulator; lịch đặt từ trình duyệt hiện đầy đủ, huỷ trên trình duyệt thì điện thoại cập nhật ngay.

---

## 5. TECHNICAL CHALLENGES & RESOLUTIONS

**Thách thức 1 — Hai người đặt cùng một khung giờ cùng lúc**
Nếu chỉ kiểm tra ở client (dựa trên dữ liệu đang hiển thị), hai người bấm "Đặt" gần như cùng lúc đều thấy khung còn trống và cùng đặt thành công.
**Giải pháp:** Dồn toàn bộ kiểm tra về `BookingService` trên server, viết hoàn toàn đồng bộ để bước kiểm tra và bước ghi không bị xen ngang (Node xử lý sự kiện tuần tự). Thêm lớp giữ chỗ 2 phút để người thứ hai bị chặn ngay khi chọn giờ, không phải đợi tới lúc bấm đặt. Kiểm chứng bằng script gửi hai yêu cầu đặt song song: một bên `confirmed`, bên kia `SLOT_TAKEN`.

**Thách thức 2 — Socket báo "Trực tiếp" trong khi điện thoại đã mất mạng**
Khi giả lập mất mạng, banner offline hiện đúng nhưng chấm trạng thái vẫn là *Trực tiếp*: WebSocket đã mở không bị đóng ngay, client phải chờ tới khi heartbeat hết hạn mới phát hiện kết nối chết — trong lúc đó thao tác đặt sẽ treo tới timeout.
**Giải pháp:** Lắng nghe `@capacitor/network`: mất mạng thì chủ động `socket.disconnect()` (store chuyển *Mất kết nối*, đánh dấu dữ liệu có thể đã cũ, nhả chỗ đang giữ), có mạng lại hoặc app quay lại foreground thì `socket.connect()` và tải lại snapshot. Đã kiểm tra lại: offline → *Mất kết nối*, online → *Trực tiếp* trong vòng 2 giây.

**Thách thức 3 — Chọn khung khác làm mất luôn lựa chọn mới**
Mỗi người chỉ giữ một khung; khi kéo dài lựa chọn, server nhả hold cũ (lý do `replaced`) rồi tạo hold mới. Client ban đầu coi mọi lần "hold của tôi bị xoá" là mất chỗ, nên xoá luôn lựa chọn vừa kéo dài.
**Giải pháp:** Gắn lý do vào sự kiện `hold:remove` (`expired`, `disconnected`, `replaced`, `booked`, `released`) và chỉ báo mất chỗ với `expired` / `disconnected`.

**Thách thức 4 — Lệch múi giờ giữa điện thoại, server và campus**
Lịch đặt phòng gắn với giờ tại trường, nhưng `Date` của JavaScript dùng múi giờ của thiết bị — điện thoại đặt sai múi giờ hoặc server deploy ở nước ngoài sẽ hiển thị và kiểm tra sai khung giờ.
**Giải pháp:** Lưu lịch dạng (ngày campus, phút trong ngày) và viết `shared/time.ts` quy đổi theo UTC+7 cố định (Việt Nam không có giờ mùa hè), dùng chung cho cả client lẫn server; có unit test cho trường hợp 23:30 UTC đã sang ngày hôm sau ở campus.

**Thách thức 5 — Build Android lỗi "Unsupported class file major version 69"**
JDK đi kèm Android Studio bản mới là Java 25, Gradle 8.14.3 trong template Capacitor chưa hỗ trợ; nâng Gradle lên 9.x thì build script chạy được nhưng plugin Capacitor 8 lại yêu cầu toolchain Java 21.
**Giải pháp:** Build bằng JDK 21 (Temurin) — APK debug build thành công, cài lên emulator và kết nối server qua `10.0.2.2:4000`. Hướng dẫn chọn Gradle JDK 21 trong Android Studio được ghi trong `README.md`.

**Thách thức 6 — Deploy lên Vercel: mỗi instance có bộ nhớ riêng nên đặt trùng**
Bản đầu tiên deploy lên Vercel vẫn lưu lịch trong RAM như khi chạy local. Thử trên production bằng 6 client cùng đặt một khung giờ: cả **6/6 đều thành công**, vì Vercel Functions có thể chạy nhiều instance, mỗi WebSocket gắn với một instance và không instance nào biết lịch của instance khác.
**Giải pháp:** Chuyển state sang Upstash Redis (Vercel Marketplace) và thêm `BookingEngine`: nạp state → chạy nghiệp vụ → ghi bằng script Lua compare-and-set, xung đột thì thử lại; thêm Socket.IO Redis adapter để sự kiện tới được client ở mọi instance. Chạy lại cùng phép thử trên production: **1 thành công, 5 nhận `SLOT_TAKEN`**, client xem ở instance khác vẫn nhận được sự kiện đặt và huỷ.

**Thách thức 7 — Socket.IO trả 404 trên Vercel**
REST API (`/api/rooms`) chạy bình thường nhưng WebSocket không kết nối được (`Unexpected server response: 404`). Thử từng đường dẫn cho thấy URL có dấu `/` cuối (`/api/socket.io/`, Socket.IO tự thêm) không khớp rewrite `/api/:path*` nên không vào được function. Thêm vào đó, Vercel biên dịch `api/server.ts` mà giữ nguyên import đuôi `.ts` khiến function không chạy được.
**Giải pháp:** Đổi rewrite sang `/api/(.*)`, tắt `addTrailingSlash` cho Socket.IO ở cả server và client, chỉ dùng transport `websocket` (Vercel không hỗ trợ long-polling); bật `rewriteRelativeImportExtensions` trong `tsconfig.json` gốc để import được đổi sang `.js` khi biên dịch. Đã kiểm tra bằng `vercel build` chạy local trước, rồi xác nhận WebSocket kết nối được trên production.
