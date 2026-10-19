# Danh sách Test Case — Kiểm thử Backend API (Team13 Restaurant)

- Ngày chạy: 2026-10-19 (theo đồng hồ hệ thống)
- Base URL: `http://localhost:3000`
- Công cụ: `curl 8.17.0` qua script `run_tests.sh` (kèm theo thư mục này)
- Mọi request/response thực tế: xem `execution_log.txt`
- Quy ước verdict cuối cùng: nếu test chạy lại ở lần bổ sung (supplemental run), lấy kết quả mới nhất.

**Tổng kết: 73 test case — PASS: 70, FAIL: 2, BLOCKED: 1**

## 1. Public API (không cần đăng nhập)

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| P01 | Trang chủ API | `GET /api/` | 200, `ok:true` | HTTP 200, `ok=true` | PASS |
| P02 | Home featured | `GET /api/home` | 200, có mảng featured | HTTP 200, `featured.length=5` | PASS |
| P03 | Menu đầy đủ | `GET /api/menu` | 200, có danh mục | HTTP 200, first category=`appetizer` | PASS |
| P04 | Lọc theo category hợp lệ | `GET /api/menu?category=appetizer` | 200, mọi món đều thuộc category | HTTP 200, mismatched=0 | PASS |
| P05 | Category không hợp lệ | `GET /api/menu?category=HACKED_XYZ` | 200, bỏ qua filter | HTTP 200, category='' (undefined) | PASS |
| P06 | Tìm kiếm q | `GET /api/menu?q=a` | 200, `flat=true` | HTTP 200, flat=true | PASS |
| P07 | Sắp xếp giá tăng dần (toàn vẹn dữ liệu) | `GET /api/menu?sort=price-asc` | 200, giá không giảm | HTTP 200, sorted=yes | PASS |
| P08 | Sort không hợp lệ | `GET /api/menu?sort=bogus` | 200, fallback mặc định | HTTP 200, sort='' | PASS |
| P09 | Chi tiết món theo slug hợp lệ | `GET /api/dishes/banh-flan-caramel` | 200, object dish + ingredients | HTTP 200, dish="Bánh Flan caramel" | PASS |
| P10 | Chi tiết món slug không tồn tại | `GET /api/dishes/slug-khong-ton-tai-qa-<ts>` | 404 `NOT_FOUND` | HTTP 404, code=NOT_FOUND | PASS |
| P11 | Endpoint không tồn tại | `GET /api/khong-co-endpoint-nay` | 404 | HTTP 404, `{ok:false,code:NOT_FOUND}` | PASS |

## 2. CORS (theo yêu cầu đề bài: SPA và API ở 2 origin khác nhau)

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| CORS01 | Response có header CORS đúng origin SPA | `GET /api/menu` + `Origin: http://localhost:5173` | `Access-Control-Allow-Origin: http://localhost:5173` (không phải `*`) | Không có header `Access-Control-Allow-Origin` nào trong response | FAIL |
| CORS02 | Preflight OPTIONS | `OPTIONS /api/menu` + `Origin` + `Access-Control-Request-Method: PATCH` | 204/200 + `Access-Control-Allow-Methods/Headers` | HTTP 200 nhưng không có `Access-Control-Allow-Methods` | FAIL |

## 3. CSRF & Authentication

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| X01 | Mutation không có CSRF token | `POST /api/auth/login` (không token) | 403 `CSRF_INVALID` | HTTP 403, code=CSRF_INVALID | PASS |
| X02 | Mutation với CSRF token sai | `POST /api/auth/login` + header `x-csrf-token: sai-token-123` | 403 `CSRF_INVALID` | HTTP 403, code=CSRF_INVALID | PASS |
| A01 | Login email sai định dạng | `{email:"khong-phai-email", password:"x12345"}` | 422 `VALIDATION_ERROR` | HTTP 422, code=VALIDATION_ERROR | PASS |
| A02 | Login thiếu password | `{email:"a@b.com"}` | 422 `VALIDATION_ERROR` | HTTP 422, code=VALIDATION_ERROR | PASS |
| A03 | Login sai mật khẩu | email admin + password sai | 401 `INVALID_CREDENTIALS` | HTTP 401, code=INVALID_CREDENTIALS | PASS |
| A04 | `/me` khi chưa đăng nhập | `GET /api/auth/me` (anonymous) | 200, `user=null` | HTTP 200, user=null | PASS |
| A05 | Login admin hợp lệ | `{email:"andykhang404@gmail.com", password:***}` | 200, role=ADMIN | HTTP 200, role=ADMIN | PASS |
| A06 | `/me` sau đăng nhập | `GET /api/auth/me` (session admin) | 200, đúng email | HTTP 200, email=andykhang404@gmail.com | PASS |
| A07 | Register confirmPassword không khớp | `{password:"qa123456", confirmPassword:"khac123"}` | 422 `VALIDATION_ERROR` | HTTP 422, code=VALIDATION_ERROR | PASS |
| A08 | Register password < 6 ký tự | `{password:"123", confirmPassword:"123"}` | 422 `VALIDATION_ERROR` | HTTP 422, code=VALIDATION_ERROR | PASS |
| A09 | Register hợp lệ | `qa.test.1792409075@gmail.com` / `qa123456` | 200 | HTTP 200, `requiresEmailConfirmation=true` | PASS |
| A10 | Register email trùng | đăng ký lại đúng email ở A09 | Không cho phép (4xx) | HTTP 400 `AUTH_ERROR` | PASS |
| L01 | Logout | `POST /api/auth/logout` (session admin) | 200 | HTTP 200 | PASS |
| L02 | Session bị thu hồi sau logout | `GET /api/admin/stats` bằng session đã logout | 401 | HTTP 401 | PASS |

## 4. Phân quyền Admin

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| M01 | Admin stats khi anonymous | `GET /api/admin/stats` (không session) | 401 `UNAUTHORIZED` | HTTP 401, code=UNAUTHORIZED | PASS |
| M02 | Admin stats với quyền admin | `GET /api/admin/stats` (admin) | 200, object stats | HTTP 200, dishCount=18 | PASS |
| M03 | Admin root | `GET /api/admin/` (admin) | 200 | HTTP 200 | PASS |
| F01 | Customer bị cấm vào admin API | Login bằng QA customer rồi `GET /api/admin/stats` | 403 `FORBIDDEN` | Không login được: HTTP 401 `EMAIL_NOT_CONFIRMED` (Supabase yêu cầu xác nhận email, không có hộp thư thật để xác nhận) | BLOCKED |

## 5. Admin — Dishes CRUD

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| D01 | List dishes khi anonymous | `GET /api/admin/dishes` (không session) | 401 | HTTP 401 | PASS |
| D02 | List dishes | `GET /api/admin/dishes` | 200, có pagination | HTTP 200, total=18 | PASS |
| D03 | Tìm kiếm dishes | `GET /api/admin/dishes?q=QA` | 200 | HTTP 200 | PASS |
| D04 | Lọc đã xóa | `GET /api/admin/dishes?deleted=1` | 200 | HTTP 200 | PASS |
| D05 | Tạo món hợp lệ (kèm nguyên liệu) | `{name:"QA Test Dish <ts>", price:99000, category:"appetizer", isAvailable:true, ingredients:[{ingredientId:<uuid>, quantity:100, unit:"g"}]}` | 201, trả về dish có id | HTTP 201, id=`122b1312-...`, slug=`qa-test-dish-1792409075` | PASS |
| D06 | Tạo món thiếu name | `{price:99000, category:"appetizer"}` | 400 `VALIDATION_ERROR` | HTTP 400, code=VALIDATION_ERROR | PASS |
| D07 | Tạo món category không hợp lệ | `{category:"KHONG_TON_TAI"}` | 400 | HTTP 400 | PASS |
| D08 | Tạo món giá âm | `{price:-500}` | 400 | HTTP 400 | PASS |
| D09 | Tạo món trùng tên (toàn vẹn slug) | cùng `name` với D05 | 201, slug tự động khác biệt | HTTP 201, slug2=`qa-test-dish-1792409075-2` | PASS |
| D10 | Xem chi tiết món | `GET /api/admin/dishes/<id D05>` | 200, kèm dishIngredients | HTTP 200, có ingredientId | PASS |
| D11 | Id không phải UUID | `GET /api/admin/dishes/khong-phai-uuid` | 404 (không crash 500) | HTTP 404 | PASS |
| D12 | UUID không tồn tại | `GET /api/admin/dishes/00000000-0000-4000-8000-...` | 404 | HTTP 404 | PASS |
| D13 | Cập nhật món | `PATCH` `{name:"...Updated", price:123000, isFeatured:true}` | 200, price=123000 | HTTP 200, price=123000 | PASS |
| D14 | Cập nhật món dữ liệu sai | `PATCH` `{name:"", price:"abc"}` | 400 `VALIDATION_ERROR` | HTTP 400 | PASS |
| D15 | Xóa mềm → ẩn khỏi public | `DELETE /api/admin/dishes/<id D09>` rồi `GET /api/dishes/<slug>` public | 200 + public 404 | delete HTTP 200, public HTTP 404 | PASS |
| D16 | Khôi phục món → hiện lại public | `POST /:id/restore` rồi GET public | 200 + public 200 | restore HTTP 200, public HTTP 200 | PASS |
| D17 | Xóa món không tồn tại | `DELETE /api/admin/dishes/<uuid random>` | 404 | HTTP 404 | PASS |

## 6. Admin — Ingredients CRUD

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| I01 | List ingredients | `GET /api/admin/ingredients` | 200 | HTTP 200 | PASS |
| I02 | Tạo nguyên liệu hợp lệ | `{name:"QA Test Ingredient <ts>", unit:"g", stockQuantity:500, pricePerUnit:1500}` | 201 | HTTP 201, id=`1a4242b2-...` | PASS |
| I03 | Tạo trùng tên | cùng `name` với I02 | 409 `CONFLICT` | HTTP 409, code=CONFLICT | PASS |
| I04 | Thiếu name | `{unit:"g"}` | 400 | HTTP 400 | PASS |
| I05 | Tồn kho âm | `{stockQuantity:-10}` | 400 | HTTP 400 | PASS |
| I06 | Xem chi tiết | `GET /api/admin/ingredients/<id I02>` | 200 | HTTP 200 | PASS |
| I07 | Cập nhật | `PATCH` `{name:"...Updated", unit:"kg", stockQuantity:250}` | 200, unit=kg | HTTP 200, unit=kg | PASS |
| I08 | Xóa mềm → xuất hiện ở danh sách deleted | `DELETE /:id` rồi `GET ?deleted=1&q=QA` | 200 + có trong deleted list | HTTP 200, inDeletedList=yes | PASS |
| I09 | Khôi phục | `POST /:id/restore` | 200 | HTTP 200 | PASS |

## 7. Admin — Chefs CRUD

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| C01 | List chefs | `GET /api/admin/chefs` | 200 | HTTP 200 | PASS |
| C02 | Tạo đầu bếp hợp lệ | `{name:"QA Test Chef <ts>", specialty:"QA Specialty", experienceYears:5, phone:"0901234567", isActive:true}` | 201 | HTTP 201, id=`cf8a1111-...` | PASS |
| C03 | SĐT không hợp lệ | `{name:"QA Bad Phone", phone:"abc-xyz"}` | 400 | HTTP 400 | PASS |
| C04 | Thiếu name | `{specialty:"X"}` | 400 | HTTP 400 | PASS |
| C05 | experienceYears vượt max | `{experienceYears:200}` | 400 | HTTP 400 | PASS |
| C06 | Xem chi tiết | `GET /api/admin/chefs/<id C02>` | 200 | HTTP 200 | PASS |
| C07 | Cập nhật | `PATCH` `{name:"...Updated", experienceYears:7}` | 200, experienceYears=7 | HTTP 200, exp=7 | PASS |
| C08 | Xóa mềm | `DELETE /:id` | 200 | HTTP 200 | PASS |
| C09 | Khôi phục | `POST /:id/restore` | 200 | HTTP 200 | PASS |

## 8. Admin — Users

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| U01 | List users | `GET /api/admin/users` | 200 | HTTP 200 | PASS |
| U02 | Role không hợp lệ | `PATCH /:id/role` `{role:"SUPERADMIN"}` | 400 | HTTP 400 | PASS |
| U03 | User không tồn tại | `PATCH /<uuid random>/role` `{role:"CUSTOMER"}` | 404 | HTTP 404 | PASS |
| U04 | Tự đổi role chính mình | `PATCH /<admin id>/role` `{role:"STAFF"}` | 400 `SELF_ROLE_CHANGE` | HTTP 400, code=SELF_ROLE_CHANGE | PASS |
| U05 | Đổi role user khác (roundtrip) | `PATCH /<QA user>/role` STAFF → CUSTOMER | 200, role đổi rồi khôi phục | HTTP 200, role1=STAFF, role2=CUSTOMER (chạy ở supplemental run) | PASS |
| U06 | Tìm kiếm user | `GET /api/admin/users?q=qa.test` | 200 | HTTP 200 | PASS |

## 9. Rate limit

| ID | Mục tiêu | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Verdict |
|----|----------|-----------------|------------------|-----------------|---------|
| R01 | Giới hạn login 20 req/phút | 25 request `POST /api/auth/login` liên tiếp | Xuất hiện 429 `RATE_LIMITED` | 15×401 rồi 10×429 | PASS |

## Ghi chú

- Dữ liệu test (2 món `QA Test Dish`, 1 nguyên liệu, 1 đầu bếp) đã được **soft-delete** sau test (API không hỗ trợ hard delete) — xem mục CLEANUP trong `execution_log.txt`.
- 2 tài khoản QA trên Supabase Auth (`qa.test.1792408932@gmail.com`, `qa.test.1792409075@gmail.com`) vẫn tồn tại (role CUSTOMER, chưa xác nhận email) — xóa tay trên Supabase Dashboard nếu cần.
- Lần chạy đầu tiên có 2 FAIL giả (A09, A10) do lỗi của test harness (dùng sai CSRF token giữa các cookie jar), đã sửa script và chạy lại toàn bộ; kết quả trong báo cáo lấy từ lần chạy thứ 2 + supplemental run.
