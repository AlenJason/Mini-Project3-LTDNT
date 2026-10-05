# MINI-PROJECT SHORT TECHNICAL REPORT
**Course:** Cross-Platform Mobile App Development (VKU)
**Mini-Project Title:** Project 2 — Đặt Phòng Học/Lab Realtime (Robin/LibCal) — Capacitor
**Team / Student Name:** Nguyễn Thiên
**Submission Date:** 05/10/2026

---

## 1. GENERAL INFORMATION & DELIVERABLE LINKS
* **Team Members:**
  1. Nguyễn Thiên — Student ID: 23IT257 — Role: Sole Developer (Full-stack Mobile) — Contribution: 100%
* **🔗 Live Demo URL:** Chưa có. Chạy local theo `README.md`: `npm run server` + `npm run dev` (web), hoặc `npm run build && npm start` để một tiến trình phục vụ cả app lẫn server realtime ở `http://localhost:4000`. Bản native chạy qua `npm run cap:android` / `npm run cap:ios`.
* **💻 GitHub Repository:** Chưa có — cập nhật sau khi push.
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

**Stack:** React 19 + TypeScript + Vite, đóng gói bằng Capacitor 8. Server realtime: Node.js + Express 5 + Socket.IO 4, chạy thẳng TypeScript bằng type stripping của Node.

**Cấu trúc thư mục chính:**
```
shared/            Dùng chung client + server
  types.ts           Room, Booking, Hold, User
  rules.ts           Quy định đặt phòng + validateSlot, bookingPhase (check-in 10/15 phút)
  time.ts            Giờ campus cố định UTC+7
  protocol.ts        Kiểu sự kiện Socket.IO, Result<T>
server/
  index.ts           Express (REST /api/rooms, phục vụ bản build) + Socket.IO
  bookingService.ts  Nguồn sự thật: giữ chỗ, đặt, huỷ, check-in, trả phòng sớm, sweep no-show
  demoBots.ts        Người dùng demo tự đặt / huỷ / check-in
  store.ts, seed.ts  Lưu file JSON, dữ liệu mẫu
src/
  store/realtime.ts  Store realtime (useSyncExternalStore): socket, snapshot theo ngày, cache offline
  services/          config, session, storage (Preferences), notifications, haptics
  pages/             Login, Rooms, RoomDetail, MyBookings, Profile, RoomDisplay
  components/        DateStrip, DayTimeline, SlotGrid, BookingSheet, BookingCard, ConnectionBanner, …
android/, ios/       Project native do Capacitor sinh ra
```

**Quản lý trạng thái:** Một store realtime dạng module (không dùng Redux/Zustand) đọc qua `useSyncExternalStore`. Store giữ dữ liệu theo ngày (`days[date]`), "lịch của tôi" và chỗ đang giữ; màn hình nào cần ngày nào thì `watchDay(date)` (đếm tham chiếu, join/leave room Socket.IO tương ứng). Mọi lệnh gửi qua `emitWithAck` có timeout 10 giây và trả về `Result<T>` thống nhất, nên UI chỉ cần xử lý `ok` / `error.message`.

**Chống đặt trùng:** Server là nguồn sự thật duy nhất. Node xử lý từng sự kiện socket tuần tự và `BookingService` hoàn toàn đồng bộ (không `await` giữa bước kiểm tra và bước ghi), nên "kiểm tra trùng rồi ghi" là nguyên tử — không cần khoá. Lớp giữ chỗ 2 phút ngăn hai người cùng điền form cho một khung giờ ngay từ đầu.

**Chiến lược xử lý ngoại lệ:**
- Mọi đầu vào từ client được kiểm tra lại ở server (kiểu dữ liệu, ngày hợp lệ, bội số 30 phút, độ dài mục đích, sức chứa); handler bọc `try/catch` và luôn trả ack.
- Mỗi mã lỗi có thông báo tiếng Việt cụ thể kèm cách xử lý (ví dụ *"Bạn đã có 3 lịch chưa sử dụng. Huỷ bớt một lịch để đặt thêm."*).
- Mất mạng hoặc server không phản hồi: lệnh trả `NETWORK` sau timeout thay vì treo; UI khoá thao tác đặt, vẫn xem được dữ liệu cache.
- Gọi plugin native (thông báo, rung) đều bọc `try/catch` và tự bỏ qua trên web.

**Kiểm thử:** 31 unit test (`node --test`) cho giờ campus, quy định đặt phòng và `BookingService` (trùng lịch, giữ chỗ, hết hạn, mất kết nối, check-in sớm / trễ, no-show, trả phòng sớm). Kiểm thử thủ công end-to-end bằng Chrome DevTools (2 người dùng độc lập) và Android emulator (APK debug).

---

## 4. EMPIRICAL EVIDENCE & SCREENSHOTS

*(Ảnh chụp từ ứng dụng đang chạy, viewport 390×844; ảnh 9 chụp từ Android emulator)*

**Ảnh 1 — Đăng nhập** (`docs/screenshots/01-login.png`)
Họ tên + MSSV; MSSV là định danh để đồng bộ lịch giữa các thiết bị.

**Ảnh 2 — Danh sách phòng realtime** (`docs/screenshots/02-rooms.png`)
Số phòng đang trống, dải lịch từng phòng với vạch "bây giờ", lọc theo loại phòng.

**Ảnh 3 — Người dùng A đang chọn giờ** (`docs/screenshots/03-selecting-hold.png`)
Khung 17:00–18:00 tô vàng, thanh dưới báo *đang giữ chỗ cho bạn*.

**Ảnh 4 — Người dùng B thấy ngay khung đang bị giữ** (`docs/screenshots/04-held-by-other-user.png`)
Khung sọc cam *Có người đang giữ chỗ*, không chọn được.

**Ảnh 5 — Form đặt phòng** (`docs/screenshots/05-booking-sheet.png`)
Đếm ngược thời gian giữ chỗ, chọn mục đích, số người (giới hạn theo sức chứa).

**Ảnh 6 — Lịch của tôi** (`docs/screenshots/06-my-bookings.png`)
Lịch đang dùng (nút *Trả phòng sớm*), lịch sắp tới với giờ mở check-in.

**Ảnh 7 — Màn hình trước cửa phòng** (`docs/screenshots/07-room-display.png`)
Trạng thái *Đang sử dụng*, người đang dùng, lịch tiếp theo trong ngày.

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
