# Lỗi do coding agent tạo ra — tái hiện và bằng chứng sau khi sửa

Tài liệu này đáp ứng yêu cầu của Block 8 (slide "Bằng chứng nộp"):
*"Một lỗi do agent tạo ra: cách tái hiện và bằng chứng sau khi sửa."*

Mỗi mục ghi: bối cảnh, nguyên nhân gốc, cách tái hiện, cách sửa, và bằng chứng sau khi sửa.

---

## Lỗi 1 — Xác nhận OTP không kiểm tra `purpose`

### Bối cảnh
Deck yêu cầu (slide 51, "Yêu cầu OTP kích hoạt"): OTP phải "gắn user và **activation**", và việc xác nhận chỉ đúng khi bản ghi OTP thuộc đúng mục đích `activation`.

### Nguyên nhân gốc
`POST /activate` đọc `ActivationChallenge` theo `userId` rồi so hash, **không kiểm tra `challenge.purpose === 'activation'`**. Câu UPDATE tiêu thụ token cũng không lọc `purpose`. Nghĩa là bất kỳ challenge nào gắn user (dù sai mục đích) đều có thể dùng để kích hoạt.

Đây là lỗi do agent sinh code: nó tạo đúng cột `purpose` trong schema nhưng quên dùng nó khi xác minh.

### Cách tái hiện
1. Tạo một `ActivationChallenge` cho user với `purpose = 'password-reset'` và OTP biết trước.
2. `POST /activate` với `email` của user và OTP đó.

Trước khi sửa: server chấp nhận, đổi `status = ACTIVE` (sai — challenge không phải để kích hoạt).

### Cách sửa
- `src/auth/routes.ts` — `POST /activate`: từ chối khi `!challenge || challenge.purpose !== 'activation'`.
- Câu `updateMany` tiêu thụ token thêm điều kiện `purpose: 'activation'`.
- `issueActivationOtp` luôn ghi `purpose: 'activation'`.

### Bằng chứng sau khi sửa
- Unit test `tests/auth-activation.test.ts`:
  - "rejects a challenge whose purpose is not activation" — trả `422`, **không** gọi `challengeUpdate`/`challengeUpdateMany`/`profileUpdate`.
  - "activates an account without creating a session" — câu claim có `purpose: 'activation'`.
- `npm test`: pass.

---

## Lỗi 2 — Bản build không copy `src/views` sang `dist/views`

### Bối cảnh
`npm start` chạy `node dist/server.js`. App cần template Handlebars ở `dist/views`.

### Nguyên nhân gốc
`tsconfig.build.json` chỉ biên dịch TypeScript sang `dist`. Script `build:server` = `tsc -p tsconfig.build.json` **không copy** thư mục `src/views`. Vì vậy `dist/views` không tồn tại.

Đây là lỗi do agent: agent dựng `build:server` mà quên bước copy asset phi-TS (views).

### Cách tái hiện
```powershell
npm run build:server
node dist/server.js
# Mở http://localhost:3000/register
```
Trước khi sửa: HTTP 500 với thông báo:
```
Error: Failed to lookup view "pages/errors/500" in views directory "...\dist\views"
```
Lỗi hiển thị chính trang lỗi cũng không render được vì thiếu cả `500.hbs`.

### Cách sửa
`package.json` — `build:server` thêm bước copy views:
```json
"build:server": "tsc -p tsconfig.build.json && node -e \"require('node:fs').cpSync('src/views','dist/views',{recursive:true})\""
```

### Bằng chứng sau khi sửa
- `npm run build:server` → `dist/views` tồn tại với `layouts/`, `pages/`, `partials/`.
- `node dist/server.js` → `GET /register` và `GET /login` trả **200** (thay vì 500).

---

## Ghi chú
- Các lỗi trên được phát hiện trong quá trình làm Block 8 và đã sửa; test hồi quy tương ứng nằm trong `tests/`.
- Lỗi môi trường không tính là lỗi agent (ví dụ: Gmail chặn mail tới hộp thư trường, SMTP credential sai) được ghi ở `docs/block8/README.md`, không phải lỗi mã nguồn.