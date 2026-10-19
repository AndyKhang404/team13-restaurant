# Danh sách Test Case — Kiểm thử Backend API (Postfix Round — Team13 Restaurant)

- Ngày chạy: **2026-10-19, 20:17–20:26 (+0700)** — chạy lại toàn bộ sau khi code sửa (CORS fix, commit `709d9ec`, HEAD `290972f`)
- Base URL: `http://localhost:3000`
- Công cụ: `curl 8.17.0` (Git Bash) — main suite: `postfix/run_tests.sh` (bản sao của `../run_tests.sh`); supplemental: `postfix/supplemental.sh`
- Bằng chứng request/response đầy đủ: `postfix/execution_log.txt`; bảng tổng kết console: `postfix/console.log`
- Quy ước: verdict lấy **kết quả mới nhất** (main run, rồi supplemental sửa cho U05).

**TỔNG KẾT CUỐI: 75 test case — PASS: 74, FAIL: 0, BLOCKED: 1**

- Main suite (73 case): `SUMMARY: PASS=71 FAIL=0 BLOCKED=2` (log dòng cuối main run)
- Supplemental (4 case mới/refix): U05 BLOCKED→**PASS**, F01 vẫn **BLOCKED**, CORS03/CORS04 **PASS**
- `FINAL: PASS=74 FAIL=0 BLOCKED=1 TOTAL=75` (in trong log)

## 1. Public API (không cần đăng nhập)

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| P01 | Trang chủ API | `GET /api/` | 200, `ok:true` | HTTP 200, `ok=true` | PASS |
| P02 | Home featured | `GET /api/home` | 200, mảng featured | HTTP 200, `featured.length=5` (Phở bò đặc biệt đứng đầu) | PASS |
| P03 | Menu đầy đủ | `GET /api/menu` | 200, có danh mục | HTTP 200, first category=`appetizer` | PASS |
| P04 | Lọc theo category hợp lệ | `GET /api/menu?category=appetizer` | 200, mọi món đúng category | HTTP 200, `mismatched=0` | PASS |
| P05 | Category không hợp lệ | `GET /api/menu?category=HACKED_XYZ` | 200, bỏ qua filter | HTTP 200, `category=''` | PASS |
| P06 | Tìm kiếm q | `GET /api/menu?q=a` | 200, `flat=true` | HTTP 200, `flat=true` | PASS |
| P07 | Sắp xếp giá tăng dần | `GET /api/menu?sort=price-asc` | 200, giá không giảm | HTTP 200, `sorted=yes` | PASS |
| P08 | Sort không hợp lệ | `GET /api/menu?sort=bogus` | 200, fallback mặc định | HTTP 200, `sort=''` | PASS |
| P09 | Chi tiết món theo slug | `GET /api/dishes/banh-flan-caramel` | 200, object dish | HTTP 200, `dish=Bánh Flan caramel` | PASS |
| P10 | Slug không tồn tại | `GET /api/dishes/slug-qa-khong-ton-tai` | 404 `NOT_FOUND` | HTTP 404, `code=NOT_FOUND` | PASS |
| P11 | Endpoint không tồn tại | `GET /api/khong-co-endpoint-nay` | 404 | HTTP 404 | PASS |

## 2. CORS (thay đổi chính của vòng fix)

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| CORS01 | Response có CORS đúng origin SPA | `GET /api/menu` + `Origin: http://localhost:5173` | `Access-Control-Allow-Origin: http://localhost:5173` (không `*`), có `Allow-Credentials: true` | HTTP 200; `ACAO: http://localhost:5173`, `Allow-Credentials: true`, `Expose-Headers: x-csrf-token`, `Vary: Origin` | **PASS (baseline: FAIL)** |
| CORS02 | Preflight | `OPTIONS /api/menu` + `Origin` + `ACR-Method: PATCH` | 204 + `Allow-Methods`/`Allow-Headers` | HTTP 204; `Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS`, `Allow-Headers: Content-Type,Authorization,x-csrf-token` | **PASS (baseline: FAIL)** |
| CORS03 | Origin lạ bị từ chối | `GET /api/menu` + `Origin: http://evil.example.com` | Không phát `Access-Control-Allow-Origin` | HTTP 200, **không có** header ACAO nào | PASS *(case mới)* |
| CORS04 | Request không Origin | `GET /api/menu` (curl thường) | Vẫn hoạt động bình thường | HTTP 200, body `{"ok":true,...}` | PASS *(case mới)* |

## 3. CSRF & Authentication

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| X01 | Mutation không CSRF token | `POST /api/auth/login` (không token) | 403 `CSRF_INVALID` | HTTP 403, `code=CSRF_INVALID` | PASS |
| X02 | Token sai | `POST /api/auth/login` + `x-csrf-token: sai-token-123` | 403 `CSRF_INVALID` | HTTP 403, `code=CSRF_INVALID` | PASS |
| A01 | Login email sai định dạng | `{email:"khong-phai-email", password:"x12345"}` | 422 `VALIDATION_ERROR` | HTTP 422, `code=VALIDATION_ERROR` | PASS |
| A02 | Login thiếu password | `{email:"a@b.com"}` | 422 `VALIDATION_ERROR` | HTTP 422, `code=VALIDATION_ERROR` | PASS |
| A03 | Login sai mật khẩu | email admin + password sai | 401 `INVALID_CREDENTIALS` | HTTP 401, `code=INVALID_CREDENTIALS` | PASS |
| A04 | `/me` khi chưa đăng nhập | `GET /api/auth/me` (anonymous) | 200, `user=null` | HTTP 200, `user=''` (null) | PASS |
| A05 | Login admin hợp lệ | `andykhang404@gmail.com` + mật khẩu đã cấp | 200, role=ADMIN | HTTP 200, `role=ADMIN` | PASS |
| A06 | `/me` sau đăng nhập | session admin | 200, đúng email | HTTP 200, `email=andykhang404@gmail.com` | PASS |
| A07 | Register confirm không khớp | `confirmPassword:"khac123"` | 422 | HTTP 422, `code=VALIDATION_ERROR` | PASS |
| A08 | Register password < 6 ký tự | `password:"123"` | 422 | HTTP 422, `code=VALIDATION_ERROR` | PASS |
| A09 | Register hợp lệ | `qa.test.1792415863@gmail.com` / `qa123456` | 200 | HTTP 200, `requiresEmailConfirmation=true` (**không trả `user.id`** — xem Finding F-1) | PASS |
| A10 | Register email trùng | đăng lại email A09 | 4xx | HTTP 400 | PASS |
| L01 | Logout | `POST /api/auth/logout` (session admin) | 200 | HTTP 200 | PASS |
| L02 | Session thu hồi sau logout | `GET /api/admin/stats` (đã logout) | 401 | HTTP 401 | PASS |

## 4. Phân quyền Admin

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| M01 | Anonymous vào admin | `GET /api/admin/stats` (không session) | 401 `UNAUTHORIZED` | HTTP 401, `code=UNAUTHORIZED` | PASS |
| M02 | Admin stats | session admin | 200, object stats | HTTP 200, `dishCount=18, chefCount=7, ingredientCount=32, userCount=6` | PASS |
| M03 | Admin root | `GET /api/admin/` (admin) | 200 | HTTP 200 | PASS |
| F01 | Customer bị cấm admin | login `qa.test.1792415863@gmail.com` rồi `GET /api/admin/stats` | 403 `FORBIDDEN` | **BLOCKED**: login trả 401 `EMAIL_NOT_CONFIRMED` (Supabase yêu cầu xác nhận email; không có hộp thư thật) — thử lại ở supplemental vẫn y hệt | BLOCKED |

## 5. Admin — Dishes CRUD

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| D01 | List anonymous | `GET /api/admin/dishes` (không session) | 401 | HTTP 401 | PASS |
| D02 | List dishes | `GET /api/admin/dishes` | 200, pagination | HTTP 200, `total=18` | PASS |
| D03 | Tìm kiếm | `GET /api/admin/dishes?q=QA` | 200 | HTTP 200 | PASS |
| D04 | Lọc đã xóa | `GET /api/admin/dishes?deleted=1` | 200 | HTTP 200 | PASS |
| D05 | Tạo món hợp lệ (kèm nguyên liệu) | `{name:"QA Test Dish 1792415863", price:99000, category:"appetizer", ingredients:[{ingredientId,quantity:100,unit:"g"}]}` | 201, có id | HTTP 201, `id=98849da0-9c58-40d4-99c8-3f31d3f7fe8d`, `slug=qa-test-dish-1792415863` | PASS |
| D06 | Thiếu name | `{price:99000, category:"appetizer"}` | 400 `VALIDATION_ERROR` | HTTP 400, `code=VALIDATION_ERROR` | PASS |
| D07 | Category sai | `{category:"KHONG_TON_TAI"}` | 400 | HTTP 400 | PASS |
| D08 | Giá âm | `{price:-500}` | 400 | HTTP 400 | PASS |
| D09 | Trùng tên (toàn vẹn slug) | cùng name với D05 | 201, slug tự suffix | HTTP 201, `slug2=qa-test-dish-1792415863-2` | PASS |
| D10 | Chi tiết theo id | `GET /api/admin/dishes/<id D05>` | 200, kèm dishIngredients | HTTP 200, `firstIngredient=fcc1df94-...` (Bánh phở) | PASS |
| D11 | Id không phải UUID | `GET /api/admin/dishes/khong-phai-uuid` | 404 (không crash 500) | HTTP 404 | PASS |
| D12 | UUID không tồn tại | `GET /api/admin/dishes/00000000-...-8000-...` | 404 | HTTP 404 | PASS |
| D13 | Cập nhật món | `PATCH {name:"...Updated", price:123000, isFeatured:true}` | 200, price=123000 | HTTP 200, `price=123000` | PASS |
| D14 | Cập nhật dữ liệu sai | `PATCH {name:"", price:"abc"}` | 400 | HTTP 400 | PASS |
| D15 | Xóa mềm → ẩn public | `DELETE <id D09>` rồi `GET /api/dishes/<slug>` | delete 200 + public 404 | delete HTTP 200, public HTTP 404 | PASS |
| D16 | Khôi phục → hiện lại | `POST /:id/restore` rồi GET public | 200 + 200 | restore HTTP 200, public HTTP 200 | PASS |
| D17 | Xóa id không tồn tại | `DELETE <uuid random>` | 404 | HTTP 404 | PASS |

## 6. Admin — Ingredients CRUD

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| I01 | List | `GET /api/admin/ingredients` | 200 | HTTP 200 | PASS |
| I02 | Tạo hợp lệ | `{name:"QA Test Ingredient 1792415863", unit:"g", stockQuantity:500, pricePerUnit:1500}` | 201 | HTTP 201, `id=38ae5c37-e4f8-4027-b8c5-ac69f581ca5b` | PASS |
| I03 | Trùng tên | name = I02 | 409 `CONFLICT` | HTTP 409, `code=CONFLICT` | PASS |
| I04 | Thiếu name | `{unit:"g"}` | 400 | HTTP 400 | PASS |
| I05 | Tồn kho âm | `{stockQuantity:-10}` | 400 | HTTP 400 | PASS |
| I06 | Chi tiết | `GET <id I02>` | 200 | HTTP 200 | PASS |
| I07 | Cập nhật | `PATCH {name:"...Updated", unit:"kg", stockQuantity:250}` | 200, unit=kg | HTTP 200, `unit=kg` | PASS |
| I08 | Xóa mềm → danh sách deleted | `DELETE /:id` rồi `GET ?deleted=1&q=QA` | 200 + có trong list | HTTP 200, `inDeletedList=yes` | PASS |
| I09 | Khôi phục | `POST /:id/restore` | 200 | HTTP 200 | PASS |

## 7. Admin — Chefs CRUD

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| C01 | List | `GET /api/admin/chefs` | 200 | HTTP 200 | PASS |
| C02 | Tạo hợp lệ | `{name:"QA Test Chef 1792415863", specialty:"QA Specialty", experienceYears:5, phone:"0901234567", isActive:true}` | 201 | HTTP 201, `id=37572d62-e5a7-47e5-88fb-1e7624452f7f` | PASS |
| C03 | SĐT sai | `{name:"QA Bad Phone", phone:"abc-xyz"}` | 400 | HTTP 400 | PASS |
| C04 | Thiếu name | `{specialty:"X"}` | 400 | HTTP 400 | PASS |
| C05 | experienceYears > max | `{experienceYears:200}` | 400 | HTTP 400 | PASS |
| C06 | Chi tiết | `GET <id C02>` | 200 | HTTP 200 | PASS |
| C07 | Cập nhật | `PATCH {name:"...Updated", experienceYears:7}` | 200, exp=7 | HTTP 200, `exp=7` | PASS |
| C08 | Xóa mềm | `DELETE /:id` | 200 | HTTP 200 | PASS |
| C09 | Khôi phục | `POST /:id/restore` | 200 | HTTP 200 | PASS |

## 8. Admin — Users

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| U01 | List users | `GET /api/admin/users` | 200 | HTTP 200 | PASS |
| U02 | Role không hợp lệ | `PATCH /:id/role {role:"SUPERADMIN"}` | 400 | HTTP 400 | PASS |
| U03 | User không tồn tại | `PATCH <uuid random>/role {role:"CUSTOMER"}` | 404 | HTTP 404 | PASS |
| U04 | Tự đổi role chính mình | `PATCH <admin id>/role {role:"STAFF"}` | 400 `SELF_ROLE_CHANGE` | HTTP 400, `code=SELF_ROLE_CHANGE` | PASS |
| U05 | Roundtrip role | `PATCH <id QA user>`: STAFF → CUSTOMER | 200, role đổi rồi hoàn nguyên | Main run: BLOCKED (A09 không trả id). Supplemental: tìm id qua `GET /api/admin/users?q=...` → `U05a` HTTP 200 `role=STAFF`, `U05b` HTTP 200 `role=CUSTOMER` | **PASS** *(fix ở supplemental)* |
| U06 | Tìm kiếm user | `GET /api/admin/users?q=qa.test` | 200 | HTTP 200 | PASS |

## 9. Rate limit

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| R01 | Giới hạn login | 25 request `POST /api/auth/login` liên tiếp | Xuất hiện 429 `RATE_LIMITED` | 15×401 rồi 10×429 (chuỗi đúng trong log) | PASS |

## Ghi chú

- **BLOCKED duy nhất còn lại: F01** (403 customer end-to-end) — cùng nguyên nhân baseline: Supabase yêu cầu xác nhận email, tài khoản test không xác nhận được (Finding F-2).
- Dữ liệu QA vòng này (2 món, 1 nguyên liệu, 1 đầu bếp) đã **soft-delete** trong CLEANUP; kiểm tra lại `GET /api/menu?q=QA Test` → `resultCount=0`.
- Tài khoản Supabase Auth tích lũy: `qa.test.1792415863@gmail.com` (vòng này) + 2 tài khoản baseline — API không có chức năng xóa user, cần xóa tay trên Dashboard.
- Sự cố khi chạy (minh bạch): lần khởi động test đầu tiên chạy nhầm WSL bash (`node: command not found`, toàn bộ HTTP 000) → **không tính vào kết quả**, log baseline được khôi phục bằng `git checkout`, chạy lại sạch bằng Git Bash. Phần rác WSL đã cắt khỏi log.
