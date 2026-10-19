# Báo cáo Kiểm thử Backend — Team13 Restaurant (Postfix Round)

> Vòng chạy lại **sau khi code được sửa** (CORS fix — commit `709d9ec`, HEAD `290972f`).
> Báo cáo baseline (trước fix): `../backend_test_report.md` — đối chiếu Before/After ở mục 5.

## 1. Tổng quan

| Mục | Giá trị |
|-----|---------|
| Ngày kiểm thử | 2026-10-19, 20:17–20:30 (+0700) |
| Người thực hiện | QA (opencode, vai trò QA Engineer) |
| Đối tượng | Backend REST API — code tại HEAD `290972f` (đã gồm CORS fix `709d9ec` + `f6edd1a`, `290972f`) |
| Phương pháp | Black-box — server thật + `curl` (Git Bash), tái lập bằng script |
| Tổng số test case | **75** (73 main suite + 2 case CORS mới) |
| **PASS** | **74** |
| **FAIL** | **0** |
| **BLOCKED** | **1** (F01) |

Bằng chứng: `execution_log.txt` (request/response thật từng case) · Bảng console: `console.log` · Danh sách case: `test_cases.md` · Script: `run_tests.sh` (bản sao), `supplemental.sh`.

**Kết luận: 2 FAIL của baseline (CORS01, CORS02) đã được sửa — không phát hiện FAIL mới. Unit test kèm theo: 36/36 pass (8 files, gồm `tests/cors.test.ts` mới); `typecheck` + `lint` sạch.**

## 2. Môi trường kiểm thử

- OS: Windows — Git Bash, Node.js v24.13.0, curl 8.17.0
- Backend: Express 5, khởi động `npx tsx src/server.ts` (PID 14448) tại `http://localhost:3000`
- DB: Supabase Postgres (remote) qua Prisma 7; Auth: Supabase Auth (cookie session)
- Tài khoản: ADMIN `andykhang404@gmail.com` (do người dùng cung cấp); QA customer tự đăng ký lúc test
- Code tree: `src/` sạch so với HEAD (chỉ `package-lock.json` + `reports/` + `docs/` ngoài HEAD) — **không sửa code trong quá trình test**
- `postfix/server.log`: **0 response HTTP 500** trong toàn bộ quá trình

### Sự cố khai báo (minh bạch, không tính vào kết quả)
Lần chạy đầu tiên đã gọi nhầm WSL bash (`node: command not found` → toàn bộ HTTP 000, `PASS=1 FAIL=55 BLOCKED=17` — **không hợp lệ**). Khắc phục: khôi phục `execution_log.txt` bằng `git checkout`, chạy lại bằng Git Bash (`C:\Program Files\Git\bin\bash.exe`), phần rác WSL đã cắt khỏi log.

## 3. Phạm vi

- **Public**: `GET /api/`, `/api/home`, `/api/menu` (filter/search/sort), `/api/dishes/:slug`
- **Auth**: `POST /api/auth/login`, `/register`, `/logout`, `GET /api/auth/me`
- **Admin**: stats, CRUD dishes / ingredients / chefs (list, detail, create, update, soft-delete, restore), users (list, đổi role)
- **Cross-cutting**: **CORS (4 case, trọng tâm vòng này)**, CSRF, phân quyền 401/403, validation 400/422, 404, conflict 409, rate limit 429, toàn vẹn dữ liệu (slug suffix, soft-delete ẩn public, sort)
- Ngoài phạm vi: upload ảnh multipart (tránh tạo file rác Storage), test 500 thật (DB remote không ngắt được), tài khoản STAFF (không có sẵn)

## 4. Kết quả chính

### 4.1. CORS — 2 FAIL baseline → 4/4 PASS

- **CORS01**: `GET /api/menu` + `Origin: http://localhost:5173` → `Access-Control-Allow-Origin: http://localhost:5173` (không `*`), `Allow-Credentials: true`, `Expose-Headers: x-csrf-token`, `Vary: Origin`.
- **CORS02**: preflight `OPTIONS` → **204** + `Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS` + `Allow-Headers: Content-Type,Authorization,x-csrf-token`.
- **CORS03** *(case mới)*: `Origin: http://evil.example.com` → **không** phát ACAO (từ chối đúng whitelist).
- **CORS04** *(case mới)*: request không `Origin` (curl thường) → 200 `ok:true`, hoạt động bình thường.

### 4.2. Các nhóm khác — như baseline, đều PASS

- Public API 11/11; CSRF 2/2 (403 `CSRF_INVALID`); Auth 12/12; Phân quyền M01–M03; CRUD dishes 17/17, ingredients 9/9, chefs 9/9, users 6/6 (U05 fix ở supplemental); rate limit R01 (15×401 → 10×429).
- Toàn vẹn dữ liệu: slug trùng tự suffix `-2` (D09), soft-delete ẩn public + restore hiện lại (D15/D16), id sai UUID → 404 không 500 (D11).

### 4.3. BLOCKED (1)

- **F01 — 403 customer end-to-end**: login `qa.test.1792415863@gmail.com` luôn trả `401 EMAIL_NOT_CONFIRMED` (Supabase yêu cầu xác nhận email, test không có hộp thư thật). Thử lại ở supplemental — vẫn y hệt. Logic 403 chỉ được xác minh gián tiếp qua unit test `tests/permissions.test.ts`.

### 4.4. Finding

- **F-1**: `POST /api/auth/register` thành công **không trả `user.id`** (chỉ `requiresEmailConfirmation/email/message`) → script không lấy được id → main run U05 BLOCKED (phải supplement qua `GET /api/admin/users?q=...`). Ảnh hưởng thật: SPA cũng không có id user ngay sau đăng ký. *(Baseline đã nêu, code chưa đổi.)*
- **F-2**: Không có tài khoản CUSTOMER đã xác nhận email → không verify được nhánh 403 end-to-end.

## 5. Before / After so với baseline (`../backend_test_report.md`)

| | Baseline (40bc986) | Postfix (290972f) |
|---|---|---|
| Tổng case | 73 | 75 (+2 CORS negative) |
| PASS / FAIL / BLOCKED | 70 / **2** / 1 | **74 / 0 / 1** |
| CORS01, CORS02 | **FAIL** (thiếu ACAO, preflight thiếu header) | **PASS** (đủ header, 204) |
| F01 | BLOCKED | BLOCKED (không đổi) |
| Unit test | 33 pass | 36 pass (thêm `tests/cors.test.ts`) |

**Code thay đổi đã xác minh qua test**: middleware `cors` đọc whitelist từ `CORS_ORIGIN` (+ dev defaults), `credentials:true`, helmet `crossOriginResourcePolicy: cross-origin`, client `credentials:'include'`, unit test CORS mới.

### Lệch chuẩn so với đề bài — **giữ nguyên từ baseline** (code không sửa ở các mục này, vẫn quan sát được trong log)

1. Lỗi nghiệp vụ trả **HTTP 4xx** (400/401/404/409/422 — thấy ở A01, M01, P10, I03...) thay vì **200 + `ok:false`** theo đề bài.
2. CRUD nằm dưới **`/api/admin/*`** (yêu cầu auth) thay vì `/api/dishes`, `/api/chefs`, `/api/ingredients` public như đề bài.
3. Tên code: `VALIDATION_ERROR` thay vì `VALIDATION_FAILED`; `CONFLICT` thay vì `ALREADY_EXISTS`; `EMAIL_NOT_CONFIRMED` thay vì `EMAIL_CONFIRMATION_REQUIRED`.
4. DELETE soft-delete trả `{id,message}` (đề bài: xóa cứng, trả `null`).
5. **CSRF bắt buộc mọi mutation** (X01/X02 chứng minh 403) — curl nghiệm thu đề bài không gửi token sẽ bị 403 nếu không GET `/api/auth/me` lấy token trước (trong cùng origin via proxy thì SPA làm việc này tự động).
6. Lỗi 500 bị bọc `{ok:false}` trong error handler (`src/app.ts`) — đề bài muốn 500/404 kỹ thuật plain; **chưa test thực tế** (không ngắt được DB remote); đọc code là còn nguyên.
7. `z.coerce.number()` chấp nhận price dạng chuỗi số (đề bài coi sai) — giữ từ baseline, code chưa đổi.
8. `loadUser` upsert Profile khi request có auth cookie (lần đầu) — GET có thể ghi DB, chưa thay đổi.

## 6. Đề xuất

1. Giữ nguyên cấu hình CORS hiện tại — đã đúng checklist đề bài.
2. Sửa F-1: `register` trả kèm `user.id` (hoặc SPA chủ động gọi `/me`) — giải phóng luôn U05/F01 khỏi phụ thuộc harness.
3. Chốt phương án với đề bài ở các mục 5.1–5.3 (đổi theo checklist hoặc giải trình trong báo cáo nhóm).
4. Thêm 1 seed CUSTOMER đã xác nhận email để test 403 end-to-end.

## 7. Dọn dẹp sau kiểm thử

- **Trong test**: 4 QA records (2 món, 1 nguyên liệu, 1 đầu bếp) soft-delete ở CLEANUP; verify `GET /api/menu?q=QA Test` → `resultCount=0`.
- **Dọn DB sâu (theo yêu cầu người dùng, sau test)** — script `qa-cleanup.ts`, hard-delete không undo:
  - `dishIngredient` 0 · `dish` **8** · `ingredient` **4** · `chef` **4** · `profile` **3**
  - Supabase Auth `deleteUser`: 3/3 OK (`qa.test.1792408932/1792409075/1792415863@gmail.com`)
  - **VERIFY re-scan: dish:0 ingredient:0 chef:0 profile:0** — sạch 100% (độc lập bằng `qa-scan.ts`)
- Không sửa code, không commit/push. Cookie jar tạm trong `postfix/tmp/` (chứa session đã logout — vô hại, có thể xóa).

## 8. Tái lập kết quả

```bash
npm run dev:server                                     # terminal 1 (port 3000)
cp reports/backend-testing/run_tests.sh reports/backend-testing/postfix/  # LOG tự trỏ về postfix/
bash reports/backend-testing/postfix/run_tests.sh      # terminal 2 — Git Bash, không dùng WSL
bash reports/backend-testing/postfix/supplemental.sh   # CORS negative + U05 + F01
```

- `postfix/run_tests.sh` **hardcode mật khẩu admin** — đọc từ biến môi trường hoặc xóa trước khi commit.
- Script tạo dữ liệu QA mới mỗi lần chạy (tự soft-delete ở cuối) → chạy lại `npx tsx reports/backend-testing/postfix/qa-cleanup.ts` nếu muốn hard-delete.
