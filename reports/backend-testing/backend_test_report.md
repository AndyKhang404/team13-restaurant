# Báo cáo Kiểm thử Backend — Team13 Restaurant

## 1. Tổng quan

| Mục | Giá trị |
|-----|---------|
| Ngày kiểm thử | 2026-10-19 (theo đồng hồ hệ thống) |
| Người thực hiện | QA (Kimi Code CLI, vai trò QA Engineer) |
| Đối tượng | Backend REST API của dự án team13-restaurant |
| Phương pháp | Black-box, chạy server thật + gọi API bằng `curl` |
| Tổng số test case | **73** |
| PASS | **70** |
| FAIL | **2** (CORS01, CORS02) |
| BLOCKED | **1** (F01) |

Bằng chứng chi tiết từng request/response: `execution_log.txt`. Danh sách test case: `test_cases.md`. Script tái lập: `run_tests.sh`.

## 2. Môi trường kiểm thử

- OS: Windows (Git Bash), Node.js v24.13.0, curl 8.17.0
- Backend: Express 5 + tsx watch (`npm run dev:server`), chạy tại `http://localhost:3000`
- Database: Supabase Postgres (remote) qua Prisma 7; Auth: Supabase Auth (cookie session)
- Tài khoản test: ADMIN `andykhang404@gmail.com` (do người dùng cung cấp); QA customer tự đăng ký trong lúc test
- Server log: `server.log` / `server.err.log` (không phát sinh lỗi 500 trong suốt quá trình test)

## 3. Phạm vi kiểm thử

Toàn bộ API surface của backend:

- **Public**: `GET /api/`, `/api/home`, `/api/menu` (filter/search/sort), `/api/dishes/:slug`
- **Auth**: `POST /api/auth/login`, `/register`, `/logout`, `GET /api/auth/me`
- **Admin** (`/api/admin`, yêu cầu quyền): stats, CRUD dishes / ingredients / chefs (list, detail, create, update, soft-delete, restore), users (list, đổi role)
- **Cross-cutting**: CSRF double-submit, phân quyền (401/403), validation (400/422), lỗi 404, conflict 409, rate limit 429, toàn vẹn dữ liệu (slug unique, soft-delete ẩn khỏi public, sort đúng thứ tự), CORS theo yêu cầu đề bài

Ngoài phạm vi / không thực hiện: upload ảnh multipart (cần Supabase Storage thật, rủi ro tạo file rác), test lỗi 500 bằng cách ngắt kết nối DB (DB remote Supabase — không thể/nguy hiểm khi can thiệp), test bằng tài khoản STAFF (không có sẵn tài khoản).

## 4. Kết quả chính

### 4.1. Các nhóm test đều PASS

- Public API: 11/11 PASS — menu, filter, search, sort (kiểm tra thứ tự giá thực tế), chi tiết món, 404 đúng.
- CSRF: mutation không token / sai token đều bị chặn 403 `CSRF_INVALID`.
- Auth: validation login/register (422), sai mật khẩu (401), đăng ký hợp lệ + email trùng (400), logout thu hồi session (401 sau logout).
- Phân quyền: anonymous vào `/api/admin/*` → 401 `UNAUTHORIZED`; tự đổi role chính mình → 400 `SELF_ROLE_CHANGE`.
- CRUD dishes/ingredients/chefs: tạo/sửa/xóa mềm/khôi phục đều đúng; validation từ chối dữ liệu thiếu/sai (tên rỗng, giá âm, category sai, SĐT sai, experienceYears > 100, tồn kho âm).
- Toàn vẹn dữ liệu: tạo 2 món trùng tên → slug tự động suffix (`...-2`); tạo nguyên liệu trùng tên → 409 `CONFLICT`; soft-delete làm món biến mất khỏi public API (404) và restore khôi phục lại (200); id không phải UUID → 404 thay vì crash 500.
- Rate limit: sau 20 request login/phút server trả 429 `RATE_LIMITED` (log: 15×401 rồi 10×429).

### 4.2. FAIL — CORS không được cấu hình (so với yêu cầu đề bài)

- **CORS01**: `GET /api/menu` với header `Origin: http://localhost:5173` → response **không có** header `Access-Control-Allow-Origin`.
- **CORS02**: `OPTIONS /api/menu` (preflight, `Access-Control-Request-Method: PATCH`) → HTTP 200 nhưng **không có** `Access-Control-Allow-Methods` / `Access-Control-Allow-Headers`.
- Đề bài (`docs/REST API và SPA.html`) yêu cầu: SPA và API chạy ở 2 origin khác nhau, response phải có `Access-Control-Allow-Origin` đúng bằng origin SPA (không dùng `*`), preflight trả 204 kèm allow-methods/headers.
- Hiện tại project né vấn đề này bằng cách **proxy `/api` qua Vite dev server** (`vite.config.ts`) và serve SPA cùng origin ở production (`express.static`), nên runtime không lỗi — nhưng nếu chấm theo đúng checklist đề bài thì đây là lỗi cần khắc phục (thêm middleware CORS đọc origin từ config).

### 4.3. BLOCKED

- **F01 — customer bị cấm vào admin API**: không login được bằng tài khoản customer mới đăng ký vì Supabase trả 401 `EMAIL_NOT_CONFIRMED` (yêu cầu xác nhận email; tài khoản QA dùng email giả không xác nhận được). Logic 403 đã được kiểm gián tiếp qua code (`requirePermission` → `forbidden()`) và unit test `tests/permissions.test.ts`, nhưng chưa verify end-to-end bằng HTTP. Đề xuất: tạo sẵn 1 tài khoản CUSTOMER đã xác nhận email để test.

## 5. Lệch chuẩn so với đề bài (quan sát, không tính FAIL vì là quyết định thiết kế)

Đối chiếu `docs/REST API và SPA.html`:

1. **Status code cho lỗi nghiệp vụ**: đề bài quy ước lỗi nghiệp vụ trả HTTP 200 kèm `ok:false`; implementation dùng HTTP 4xx đúng chuẩn REST (400/401/403/404/409/422) với envelope `{ok:false, error:{code,message,fields}}`. Response shape đúng yêu cầu; cách dùng status code khác đề bài.
2. **Tên endpoint**: đề bài yêu cầu CRUD tại `/api/dishes`, `/api/chefs`, `/api/ingredients` (không auth); implementation đặt CRUD dưới `/api/admin/*` có phân quyền, public chỉ có `/api/menu` và `/api/dishes/:slug`.
3. **Mã lỗi**: đề bài dùng `VALIDATION_FAILED`; implementation dùng `VALIDATION_ERROR`.
4. **DELETE**: đề bài trả `null` (xóa cứng); implementation soft-delete và trả `{id, message}`.
5. **Kiểu dữ liệu price**: đề bài coi `"50000"` (chuỗi) là input sai; implementation dùng `z.coerce.number()` nên **chấp nhận** chuỗi số (ví dụ `"123000"` vẫn pass). Chuỗi không phải số (`"abc"`) vẫn bị 400 đúng (test D14).
6. **Lỗi 500**: đề bài yêu cầu lỗi hệ thống KHÔNG bọc `ok:false`. Đọc code `src/app.ts:73-91`: error handler bọc mọi lỗi (kể cả 500) vào envelope `{ok:false, code:"INTERNAL_ERROR"}` — lệch đề bài. Không test thực tế được vì không thể ngắt DB remote.

## 6. Đề xuất cải thiện

1. Thêm middleware `cors` với origin đọc từ config (vd `APP_URL` / biến `SPA_ORIGIN`), xử lý preflight OPTIONS trả 204 — nếu muốn đúng checklist đề bài.
2. Thống nhất với đề bài về quy ước status code / endpoint, hoặc ghi rõ trong báo cáo nhóm rằng nhóm chọn chuẩn REST 4xx + có auth (vượt yêu cầu) để tránh bị trừ điểm khi chấm theo checklist.
3. Bổ sung endpoint hoặc cơ chế xóa cứng dữ liệu test (hiện chỉ có soft-delete; dữ liệu QA tích lũy trong bảng deleted).
4. `POST /api/auth/register` khi `requiresEmailConfirmation=true` không trả về `user`/`profile` — SPA không lấy được id user ngay sau đăng ký; cân nhắc trả kèm.
5. Có sẵn tài khoản CUSTOMER đã xác nhận email trong seed để test phân quyền 403 end-to-end.

## 7. Dọn dẹp sau kiểm thử

- 2 món `QA Test Dish *`, 1 nguyên liệu, 1 đầu bếp test đã được **soft-delete** (xem mục CLEANUP trong `execution_log.txt`, tất cả HTTP 200).
- 2 tài khoản Supabase Auth `qa.test.1792408932@gmail.com` và `qa.test.1792409075@gmail.com` (role CUSTOMER) vẫn tồn tại — API không có chức năng xóa user; cần xóa tay trên Supabase Dashboard nếu muốn.
- Không sửa code, không commit/push. Cookie jar tạm (chứa session) đã được xóa.

## 8. Tái lập kết quả

```bash
npm run dev:server                       # terminal 1
bash reports/backend-testing/run_tests.sh # terminal 2 (sau khi server lên)
```

Lưu ý: script tạo dữ liệu test mới trên DB mỗi lần chạy và tự soft-delete ở cuối; mật khẩu admin đang được hardcode trong script — xóa/thay trước khi commit.
