# Team13 Restaurant — Tài liệu thuyết trình

- **Môn học**: Phát triển ứng dụng Web (CSC13008) — HCMUS
- **Nhóm 13**: Phùng Bảo Khang · Nguyễn Minh Đức · Hy Huê Hưng
- **Ngày**: 13/10/2026
- **Demo**: `http://localhost:3000` (xem thêm [README](README.md))

> Tài liệu tổng hợp chuẩn xác từ mã nguồn thực tế và 3 báo cáo AI usage trong `docs/`:  
> [`docs/AI_USAGE_KHANG.md`](docs/AI_USAGE_KHANG.md) · [`docs/AI_PROMPT_REPORT.md`](docs/AI_PROMPT_REPORT.md) · [`docs/AI_USAGE_HUNG.md`](docs/AI_USAGE_HUNG.md).

---

## 1. Tổng quan sản phẩm

Web nhà hàng SSR (Server-Side Rendering) với 2 cổng tích hợp trên cùng một ứng dụng Express:

| Cổng | Định tuyến (Route) | Chức năng chính |
|---|---|---|
| **Public (`/`)** | `/`<br>`/menu`<br>`/dishes/:slug`<br>`/login`, `/register`, `/logout` | - **Trang chủ**: Hero tách đôi, món nổi bật, ticker chạy liền mạch, chuyển đổi theme sáng/tối.<br>- **Thực đơn**: Lọc danh mục, tìm kiếm và sắp xếp giá/tên thực hiện phía server qua query params.<br>- **Chi tiết món**: Định dạng tiền VND, danh sách nguyên liệu, thẻ bếp trưởng, modal chi tiết bếp (`<dialog>`) kèm avatar fallback phong cách Facebook.<br>- **Xác thực**: Đăng nhập, đăng ký tài khoản (Supabase Auth). |
| **Admin (`/admin`)** | `/admin`<br>`/admin/dishes`<br>`/admin/chefs`<br>`/admin/ingredients`<br>`/admin/users` | - **Dashboard**: Thống kê số lượng thực tế (món, đầu bếp, nguyên liệu, tài khoản) và 5 món mới cập nhật.<br>- **Quản trị món & công thức**: CRUD món kèm phân bổ nguyên liệu động, xử lý ảnh, hỗ trợ form `PATCH`/`DELETE` và trang xác nhận xóa riêng biệt.<br>- **Quản trị đầu bếp & kho**: CRUD đầu bếp, kiểm soát kho và giá vốn nguyên liệu.<br>- **Quản lý người dùng**: Xem danh sách và thay đổi vai trò (chỉ dành cho `ADMIN`). |

> **Dữ liệu live (13/10/2026)**: **16 món ăn · 7 đầu bếp · 31 nguyên liệu · 3 tài khoản** (1 ADMIN, 1 STAFF, 1 CUSTOMER).

---

## 2. Đội ngũ & Phân công nhiệm vụ

| Thành viên | Mảng chính | Đóng góp kỹ thuật nổi bật |
|---|---|---|
| **Phùng Bảo Khang** | Kiến trúc & Backend lõi | Khảo sát kiến trúc 38 quyết định; thiết lập hệ thống Zod env, SEO slug, Supabase storage, ma trận phân quyền RBAC, middleware bảo mật (CSRF, flash, method-override); chuẩn hóa RLS và chuyển dịch SQL sang Prisma migration versioned. |
| **Nguyễn Minh Đức** | UI/UX & Frontend SSR | Chuyển đổi mockup tĩnh sang view SSR Handlebars; hoàn thiện hero layout, ticker chữ chạy vô hạn, dark/light theme bằng CSS variables + View Transitions API; typography chuẩn 100% tiếng Việt; skeleton loading thuần CSS; bộ tìm kiếm/lọc/sắp xếp server-side. |
| **Hy Huê Hưng** | Vận hành, Validation & Test | Thiết lập DB ban đầu; chuẩn hóa bộ ảnh món ăn chất lượng cao; hiện thực modal chi tiết bếp (`<dialog>`) và avatar fallback; rà soát validation A–H (kiểm tra SĐT, chống trùng lặp, chặn UUID lỗi); mở rộng bộ kiểm thử tự động (hiện đạt 32 tests Vitest). |

---

## 3. Tech Stack

- **Backend / SSR**: Express 5 (`^5.3.0`) kết hợp `express-handlebars` (`^9.0.2`) với 2 layout độc lập (`public.hbs` và `admin.hbs`), TypeScript strict (chế độ `NodeNext` ESM, target `ES2023`).
- **Styling**: Tailwind CSS v4 (tối ưu dựng nhanh form quản trị) + CSS viết tay có cấu trúc (`style.css` cho public, `admin.css` cho admin) theo design system nhất quán, hỗ trợ dark/light theme không phụ thuộc framework JS.
- **Cơ sở dữ liệu & Lưu trữ**: PostgreSQL trên Supabase + Prisma ORM 7 (`@prisma/adapter-pg`); Supabase Auth (quản lý phiên làm việc qua signed cookie); Supabase Storage bucket `images` phân nhánh thư mục (`dishes`, `chefs`, `ingredients`).
- **An toàn & Bảo mật**: Xác thực dữ liệu đa tầng bằng Zod, chống CSRF double-submit (`csrf-csrf`), HTTP security headers (`helmet`), rate-limiting tự xây dựng cho auth, upload ảnh kiểm tra magic bytes và giới hạn dung lượng.
- **Kiểm thử & Chất lượng**: Vitest (32/32 tests passed), typecheck không lỗi (`tsc --noEmit`), render thử template với mockup dữ liệu, kiểm tra request live.

---

## 4. Quy trình phát triển (Workflow)

```
npm install → cấu hình .env → npx prisma migrate deploy → npx prisma db seed
→ npm run dev (chạy song song Express server + Tailwind watch)
→ Phát triển tính năng theo nhánh feat/* → npm run test + npm run typecheck
→ Tạo PR vào main → Code Review → Merge
```

- **Kiểm tra Env chặt chẽ khi khởi động**: Zod schema trong `src/config/env.ts` quét toàn bộ biến môi trường; nếu thiếu hoặc sai định dạng (ví dụ key không đúng chuẩn URL), tiến trình lập tức thông báo rõ tên biến lỗi và dừng server.
- **Kiểm soát Schema bằng Migration**: 100% thay đổi DB được lưu vết trong `prisma/migrations/` (từ khởi tạo bảng, enum danh mục đến các ràng buộc `CHECK` và chính sách bảo mật RLS).
- **Lịch sử tích lũy**: Port UI/UX mockup → Bổ sung validation A–H → Modal chi tiết đầu bếp & avatar fallback → Admin dashboard & nâng cấp phân quyền STAFF → Chuẩn hóa CRUD qua form `PATCH`/`DELETE` + trang xác nhận xóa riêng.

---

## 5. Vòng đời Request (Runtime Lifecycle)

### 5.1. Xem chi tiết món ăn (Public Flow)
- Người dùng truy cập từ `/menu` hoặc liên kết trực tiếp `GET /dishes/:slug`.
- Express đọc `slug` từ path parameter → Truy vấn Prisma với điều kiện `deletedAt: null`.
- Ẩn đầu bếp nếu đầu bếp đã bị xóa mềm hoặc đang nghỉ việc (`isActive: false`).
- Render view Handlebars kèm danh sách nguyên liệu và thông tin đầu bếp.
- Đảm bảo chuẩn SEO tiếng Việt, hỗ trợ reload, back/forward và chia sẻ đường dẫn chuẩn xác.

### 5.2. Luồng CRUD Quản trị (Admin Flow)
- Form gửi yêu cầu qua `POST` (kèm hidden field `_method=PATCH` hoặc `_method=DELETE` khi chỉnh sửa/xóa).
- Middleware kiểm tra: CSRF token hợp lệ → Multer parser (giới hạn trần 5MB) → Zod validation schema.
- **Xử lý lỗi nhập liệu**: Khi dữ liệu không hợp lệ hoặc trùng lặp, server trả mã **HTTP 400 Bad Request**, render lại form và giữ nguyên toàn bộ dữ liệu người dùng đã điền kèm thông báo lỗi cụ thể từng trường.
- **Chống trùng lặp dữ liệu**:
  - Tự động sinh slug duy nhất bằng thuật toán thêm hậu tố `-2`, `-3` (`nextFreeSlug`).
  - Kiểm tra trùng nguyên liệu trong cùng một món ăn trên form (tránh vi phạm composite primary key `(dishId, ingredientId)`).
  - Kiểm tra trùng tên nguyên liệu không phân biệt hoa thường (`mode: 'insensitive'`).
- **Ghi dữ liệu & Xử lý ảnh (`saveWithImage`)**: Upload file ảnh mới lên Supabase Storage trước; nếu thao tác ghi DB gặp lỗi, ảnh vừa tải lên sẽ tự động bị xóa rollback để tránh lãng phí dung lượng.
- **Phản hồi chuẩn HTTP**: Ghi flash message vào cookie và phản hồi **HTTP 303 See Other** điều hướng về trang danh sách (ngăn ngừa việc F5 submit lại form).
- **Xóa an toàn**: Thao tác xóa sử dụng soft-delete (cập nhật trường `deletedAt`), có trang xác nhận riêng (`GET /admin/.../:id/delete`); yêu cầu `GET` tuyệt đối không làm thay đổi trạng thái dữ liệu.

### 5.3. Xử lý Upload ảnh
- Chọn tệp từ máy → Multer lưu tạm vào bộ nhớ (`memoryStorage`).
- Hàm `validateImage` kiểm tra: Định dạng hỗ trợ (JPEG, PNG, WebP), kiểm tra chữ ký nhị phân thực tế (**magic bytes**), dung lượng $\le 2\text{MB}$.
- Đẩy file lên đường dẫn `images/<folder>/<uuid>.<ext>` trên Supabase Storage → Lấy public URL lưu vào DB.
- Khi cập nhật ảnh mới hoặc xóa đối tượng, file ảnh cũ trên bucket sẽ được xóa dọn dẹp.

### 5.4. Xác thực & Phân quyền (Auth & RBAC)
- Khách vãng lai đăng ký/đăng nhập qua Supabase Auth → Phiên làm việc được quản lý qua signed cookies an toàn.
- Middleware `loadUser` giải mã token, tự động tạo hồ sơ lazy-create trong bảng `profiles` nếu chưa có (mặc định vai trò `CUSTOMER`).
- Middleware `requirePermission` kiểm tra quyền theo ma trận tĩnh `can(user, permission)`:
  - **`ADMIN`**: Toàn quyền truy cập quản trị và **độc quyền** quản lý người dùng (`user:manage`).
  - **`STAFF`**: Được cấp quyền `admin:access` vào `/admin` và quản lý nội dung (món ăn, đầu bếp, nguyên liệu), nhưng **không có** quyền `user:manage` (menu người dùng bị ẩn và đường dẫn `/admin/users` trả về 403).
  - **`CUSTOMER`**: Chỉ được sử dụng các chức năng công khai, bị chặn hoàn toàn khỏi `/admin`.

---

## 6. Mô hình Dữ liệu (Data Model)

```
chefs (1) ──< dishes (N) >──< ingredients (M)
              │ (qua dish_ingredients: quantity, unit)
              ▼
profiles (id = auth.users.id; role: ADMIN / STAFF / CUSTOMER)
```

- **`chefs`**: `id` (UUID), `name`, `avatar_url`, `specialty`, `bio`, `experience_years`, `phone`, `is_active`, `deleted_at`.
- **`dishes`**: `id` (UUID), `name`, `slug` (unique, SEO tiếng Việt), `price`, `category` (enum `dish_category`: appetizer, main, dessert, drink, combo), `image_url`, `chef_id` (nullable, `onDelete: SetNull`), `deleted_at`.
- **`ingredients`**: `id` (UUID), `name` (unique), `unit`, `stock_quantity`, `price_per_unit`, `image_url`, `deleted_at`.
- **`dish_ingredients`**: Composite PK `(dish_id, ingredient_id)`, `quantity`, `unit`.
- **`profiles`**: `id` (UUID khớp `auth.users.id`), `email`, `display_name`, `role` (enum: `ADMIN`, `STAFF`, `CUSTOMER`).
- **Ràng buộc toàn vẹn cơ sở dữ liệu**:
  - CHECK constraints: `price >= 0`, `stock_quantity >= 0`, `price_per_unit >= 0`, `experience_years >= 0`, `quantity > 0`, `prep_time_minutes > 0`.
  - Row Level Security (RLS): Kích hoạt trên toàn bộ các bảng; quyền đọc công khai (loại bỏ bản ghi đã xóa mềm); bảng `profiles` chỉ cho phép người dùng tự đọc thông tin của chính mình.

---

## 7. Các Quyết định Kỹ thuật — Kiến trúc & Backend

| # | Quyết định áp dụng | Phương án đã loại bỏ | Lý do lựa chọn |
|---|---|---|---|
| **1** | **SSR (Express 5 + Handlebars)** | SPA (React, Vue, Vite) | Đảm bảo SEO, hoạt động tức thì không cần JavaScript client, đúng chuẩn yêu cầu môn học. |
| **2** | **TypeScript Strict + NodeNext ESM** | JavaScript thuần | Phát hiện lỗi sớm lúc biên dịch, duy trì codebase sạch không lỗi typecheck. |
| **3** | **Supabase Postgres + Prisma ORM 7** | SQL thô / TypeORM / Sequelize | Tích hợp tiện lợi Auth, Storage và Postgres; hỗ trợ migration có versioning rõ ràng. |
| **4** | **Định danh món qua SEO slug** | ID số `/dishes/1` | Thân thiện người dùng và tối ưu SEO; vẫn tuân thủ nguyên tắc nhận diện tài nguyên qua path parameter. |
| **5** | **UUID nội bộ, ID sai trả 404** | Để Prisma ném lỗi 500 | Hàm `paramId` bắt UUID không đúng định dạng và trả về trang 404 thân thiện thay vì làm sập trang. |
| **6** | **1 bucket `images` chia thư mục con** | Tạo 3 bucket độc lập | Tối ưu cấu hình seed script, quản lý phân quyền gọn gàng trong một bucket duy nhất. |
| **7** | **Phân quyền RBAC 2 tầng cho Admin** | Cho phép mọi role hoặc chỉ mỗi ADMIN | `STAFF` được hỗ trợ cập nhật nội dung thực đơn/kho, nhưng tách riêng `user:manage` cho `ADMIN` để giảm thiểu rủi ro bảo mật. |
| **8** | **Xóa mềm (Soft-delete) + Trang xác nhận** | Xóa cứng / Xóa trực tiếp tại list | Ngăn ngừa mất dữ liệu; các route `GET` thuần túy chỉ hiển thị giao diện xác nhận, không bao giờ thay đổi dữ liệu. |
| **9** | **Form PATCH/DELETE + Redirect 303** | Dùng toàn bộ POST | Tuân thủ đúng ngữ nghĩa HTTP RESTful; redirect 303 ngăn tình trạng gửi lặp form khi người dùng nhấn F5. |
| **10** | **Profile lazy-create, role mặc định CUSTOMER** | Gán quyền thủ công | Đăng ký xong là sử dụng được ngay, đảm bảo tính liên tục của trải nghiệm người dùng. |
| **11** | **Xác thực 3 lớp (Client → Zod → DB CHECK/PK)** | Chỉ validate 1 lớp | Mỗi lớp có nhiệm vụ chặn một loại lỗi riêng (Zod bắt lỗi format trả về 400/422, DB chặn lỗi race condition và toàn vẹn dữ liệu). |
| **12** | **Nguồn ảnh bản quyền mở (Openverse, Flickr, Unsplash)** | Ảnh mock / placeholder xám | Ảnh chân thực, có giấy phép mở minh bạch, không phụ thuộc API key ngoài. |
| **13** | **Rate-limiting tự xây dựng cho Auth** | Không giới hạn / Cài thêm thư viện nặng | Chống brute-force đăng nhập hiệu quả mà không làm phình dependency của dự án. |
| **14** | **Hỗ trợ biến môi trường Supabase mới & cũ** | Chỉ nhận 1 tên biến cố định | Tương thích linh hoạt với cả Dashboard Supabase đời mới và các cấu hình cũ. |
| **15** | **Quy trình Feature Branch & PR vào main** | Commit và push thẳng vào `main` | Đảm bảo code được rà soát chất lượng, lịch sử commit minh bạch và dễ truy vết. |

---

## 8. Các Quyết định Kỹ thuật — UI/UX & Vận hành

| # | Quyết định áp dụng | Phương án đã loại bỏ | Lý do lựa chọn |
|---|---|---|---|
| **16** | **Không dùng AJAX client, form GET/POST thuần** | Client-side Fetch/Axios | Đơn giản hóa kiến trúc, xử lý CSRF trực tiếp và chuẩn mực SSR. |
| **17** | **Tailwind CSS v4 (Form) + CSS viết tay (Giao diện)** | Dùng duy nhất 1 công cụ | Tailwind giúp dựng form admin nhanh chóng; CSS viết tay giúp cá nhân hóa toàn bộ design system nhà hàng. |
| **18** | **Dark/Light Theme bằng CSS checkbox + localStorage** | Toggle qua JS framework | Không cần tải thư viện JS, trạng thái lưu bền vững, chuyển cảnh mượt với View Transitions API. |
| **19** | **Typography 100% tiếng Việt** | Font mặc định hệ thống | Kết hợp Playfair Display (tiêu đề), Be Vietnam Pro (nội dung) và IBM Plex Mono; kiểm tra chuẩn subset Vietnamese. |
| **20** | **Loại bỏ hiệu ứng phóng to ảnh; skeleton thuần CSS** | Scale zoom + spinner JS | Trải nghiệm cuộn trang mượt mà, không giật lag và không gây hiện tượng layout-shift (CLS). |
| **21** | **Modal đầu bếp (`<dialog>`) + Avatar fallback Facebook** | Chuyển trang bếp riêng | Xem nhanh tiểu sử không cần rời trang chi tiết; nếu thiếu ảnh thật vẫn có avatar silhouette đồng bộ. |
| **22** | **Việt hóa form, báo lỗi chi tiết, giữ lại dữ liệu** | Giao diện tiếng Anh / Mất dữ liệu khi lỗi | Thân thiện với người dùng Việt Nam; khi nhập sai không phải tốn công gõ lại từ đầu. |
| **23** | **Tìm kiếm, lọc danh mục và sắp xếp phía server** | Lọc dữ liệu bằng JS ở client | Tối ưu SEO, hỗ trợ người dùng bookmark hoặc chia sẻ trực tiếp URL kết quả tìm kiếm. |

---

## 9. Hành trình Tinh chỉnh UI/UX

Bắt đầu từ bản mockup HTML/CSS sơ khởi, nhóm đã chuyển thể thành các template SSR Handlebars kết nối trực tiếp với backend. Quá trình hoàn thiện được triển khai qua từng bước có kiểm chứng thực tế:
1. Thiết kế hero đôi kèm ticker chữ cuộn liên tục nhằm tạo ấn tượng thương hiệu.
2. Xây dựng theme Sáng/Tối với núm gạt chuyển đổi mượt mà, đồng bộ màu sắc tương phản cao trên cả 2 chế độ.
3. Tối ưu animation hover tinh tế, loại bỏ triệt để hiệu ứng zoom ảnh gây rối mắt.
4. Xử lý hiển thị skeleton loading, chuẩn hóa font chữ tiếng Việt không bị lỗi dấu thanh.
5. Thiết kế responsive đa thiết bị (từ mobile hẹp 360px đến desktop) và bổ sung bộ công cụ tìm kiếm, lọc, sắp xếp trên trang thực đơn.

---

## 10. Nhật ký Sử dụng AI của 3 Thành viên

- **Phùng Bảo Khang** ([`docs/AI_USAGE_KHANG.md`](docs/AI_USAGE_KHANG.md), Antigravity): Áp dụng phương pháp phỏng vấn kiến trúc 38 quyết định trước khi bắt tay viết mã backend lõi; rà soát và vá lỗi chính sách RLS; chuyển đổi toàn bộ cấu trúc DB sang Prisma migration; xử lý triệt để xung đột schema `deleted_at`.
- **Nguyễn Minh Đức** ([`docs/AI_PROMPT_REPORT.md`](docs/AI_PROMPT_REPORT.md)): Nhật ký 17 lượt prompt tập trung vào mảng UI/UX; tuân thủ nguyên tắc chỉ tác động vào views `.hbs` và CSS; giải quyết triệt để lỗi hiển thị font tiếng Việt và hoàn thiện bộ lọc thực đơn.
- **Hy Huê Hưng** ([`docs/AI_USAGE_HUNG.md`](docs/AI_USAGE_HUNG.md), OpenCode + Muse Spark): Xây dựng cơ sở dữ liệu và tuyển chọn bộ ảnh chất lượng cao; giải quyết lỗi khởi động server; triển khai modal `<dialog>` cho đầu bếp; hoàn thiện bộ validation A–H và mở rộng bộ kiểm thử tự động lên 32 tests.

---

## 11. Kiểm chứng Chất lượng Thực tế (13/10/2026)

```bash
# Kiểm thử đơn vị & tích hợp
npm run test
# Kết quả: 8 test files, 32/32 tests passed (Duration: ~360ms)

# Kiểm tra tĩnh mã nguồn TypeScript
npm run typecheck
# Kết quả: 0 lỗi biên dịch (tsc --noEmit)
```

- **Kiểm tra render template**: Tất cả các template (modal/avatar đầu bếp, form quản trị món ăn, kho nguyên liệu, đăng nhập/đăng ký) đều render chuẩn xác với dữ liệu mẫu.
- **Kiểm tra request thực tế**: Các trang `/`, `/menu`, `/login`, `/register`, `/dishes/pho-bo-dac-biet` phản hồi HTTP 200, tài nguyên CSS tải đầy đủ, số điện thoại đầu bếp được bảo vệ không lộ ở trang công khai.
- **Xử lý tình huống ngoại lệ**: Các đường dẫn chứa ID hoặc slug không hợp lệ (ví dụ: `/dishes/abc` hoặc `/dishes/2`) đều được điều hướng chính xác về trang 404 Not Found.

---

## 12. Kịch bản Demo Trực tiếp (Khung thời gian 5 phút)

1. **Phút 1 — Trang chủ (`/`)**: Trình diễn banner hero, danh sách món nổi bật, ticker chạy vô hạn; trải nghiệm chuyển đổi Dark/Light theme tức thì.
2. **Phút 2 — Trang thực đơn (`/menu`)**: Thử nghiệm tìm kiếm món ăn (`?q=pho`), lọc theo từng nhóm danh mục và sắp xếp theo giá tiền; quan sát URL tự cập nhật.
3. **Phút 3 — Chi tiết món ăn (`/dishes/pho-bo-dac-biet`)**: Xem thông tin giá, quy cách chế biến, danh sách nguyên liệu; nhấn vào thẻ đầu bếp để mở modal `<dialog>` và đóng bằng nút × / bấm nền / phím Esc.
4. **Phút 4 — Trang Quản trị (`/admin`)**:
   - Đăng nhập bằng tài khoản `STAFF` → Hiển thị dashboard, thực hiện sửa món ăn; chứng minh menu Người dùng bị ẩn và truy cập `/admin/users` bị chặn 403.
   - Đăng nhập tài khoản `ADMIN` → Vào `/admin/dishes/new`, cố tình chọn trùng 2 dòng cùng một nguyên liệu để chứng minh server trả lỗi **400 Bad Request** và giữ nguyên dữ liệu đã nhập.
   - Trình diễn trang xác nhận xóa món ăn trước khi thực hiện xóa mềm.
5. **Phút 5 — Trang Lỗi (`/dishes/duong-dan-khong-ton-tai`)**: Chứng minh trang 404 thân thiện hiển thị đúng ngữ cảnh.

---

## 13. Đánh giá & Bài học Kinh nghiệm

- **Hạn chế còn tồn đọng**: Cần bổ sung thêm kiểm thử tự động E2E mô phỏng hành vi trình duyệt (như Playwright/Cypress) để bao phủ trọn vẹn kịch bản upload file vượt trần 5MB và rate-limit đăng nhập liên tục.
- **Bài học rút ra**:
  - Xác thực dữ liệu đa lớp là bắt buộc: Client hỗ trợ người dùng, Zod bảo vệ nghiệp vụ ở tầng ứng dụng, và CHECK constraints/RLS là chốt chặn cuối cùng bảo vệ DB.
  - Mọi thay đổi cơ sở dữ liệu phải thông qua file migration có version thay vì thao tác tay trên GUI.
  - Các yêu cầu HTTP phương thức `GET` phải đảm bảo tính an toàn (idempotent), không được phép làm thay đổi dữ liệu.
  - Áp dụng kỹ thuật render template thử nghiệm với dữ liệu giả lập giúp phát hiện sớm các lỗi giao diện trước khi triển khai thực tế.
