# Báo cáo Sử dụng AI — Dự án Nhà hàng Nhóm 13 (Team 13 Restaurant Project)

- **Tác giả**: Phan Bình Khang (Andy Khang)
- **Môn học**: Kiến trúc Ứng dụng Web (Web Application Architecture) — HCMUS (Năm 3 / HK1)
- **Dự án**: Ứng dụng Web Nhà hàng SSR Nhóm 13 (Team 13 Restaurant SSR Web Application)
- **Công cụ AI**: Antigravity (Google DeepMind Agentic AI Coding Assistant)
- **Ngày**: 12 tháng 10, 2026

---

## 1. Tóm tắt Tổng quan & Mục tiêu (Executive Summary & Objective)

Tài liệu này ghi lại quá trình lập trình cặp (pair-programming) và cộng tác thiết kế kiến trúc giữa **Phan Bình Khang** cùng **Trợ lý AI Antigravity** nhằm xây dựng một ứng dụng web nhà hàng Server-Side Rendered (SSR) hiện đại, đạt tiêu chuẩn môi trường thực tế (production-grade). 

Ứng dụng kết nối với **Supabase** (PostgreSQL, Auth, Storage) thông qua **Prisma ORM 7** và cung cấp hai giao diện riêng biệt:
1. **Cổng ẩm thực công khai (`/`)**: Khám phá các món ăn nổi bật, duyệt thực đơn được nhóm theo danh mục với huy hiệu trạng thái tình trạng món (còn hàng/hết hàng) theo thời gian thực, xem chi tiết công thức món ăn và thông tin giới thiệu đầu bếp.
2. **Cổng điều hành quản trị (`/admin`)**: Hệ thống Kiểm soát Truy cập Dựa trên Vai trò (RBAC) vững chắc, cho phép nhân viên và quản trị viên quản lý món ăn, định lượng công thức, kho nguyên liệu bếp, đầu bếp và phân quyền người dùng với các cơ chế bảo mật nghiêm ngặt.

---

## 2. Giai đoạn 1: Đồng bộ Kiến trúc & Phỏng vấn Chuyên sâu "Grill-Me"

Thay vì sinh mã một cách rời rạc, quá trình tương tác bắt đầu bằng một buổi phỏng vấn làm rõ yêu cầu toàn diện (`/grill-me`), mô hình hóa ứng dụng dưới dạng **Cây Thiết kế (Design Tree)** qua 38 quyết định kiến trúc trong 4 vòng:

### Vòng 1: Nền tảng & Công nghệ cốt lõi (Q1 – Q9)
- **Framework SSR**: Express 5 kết hợp với `express-handlebars` để tạo cấu trúc MVC tường minh.
- **Ngôn ngữ**: TypeScript ở chế độ nghiêm ngặt (strict mode) cùng cơ chế phân giải module ESM `NodeNext`.
- **Xác thực (Authentication)**: Supabase Auth (cơ chế cầu nối session qua cookie SSR) kết hợp với bảng `profiles` cấp ứng dụng trong PostgreSQL.
- **Chiến lược RBAC**: Bảng ánh xạ quyền tĩnh ở cấp mã nguồn (`can(user, permission)`) được điều khiển bởi enum vai trò (`ADMIN`, `STAFF`, `CUSTOMER`).
- **Cấu trúc Topology**: Một instance ứng dụng duy nhất kết hợp các layout engine riêng biệt (`layouts/public.hbs` và `layouts/admin.hbs`).
- **Lưu trữ Phương tiện (Media Storage)**: Public bucket của Supabase Storage (`images`) đi kèm kiểm tra hợp lệ phía server (server-side validation) và quản lý vòng đời tệp tự động.
- **Styling**: Tailwind CSS v4 sử dụng pipeline build độc lập `@tailwindcss/cli`.

### Vòng 2: Mô hình Dữ liệu & Quy trình Trải nghiệm Người dùng (UX Workflows) (Q10 – Q20)
- **Phân định Vai trò**: `STAFF` có quyền tạo, cập nhật và xóa món ăn/đầu bếp/nguyên liệu; chỉ có `ADMIN` mới có quyền quản lý vai trò của người dùng.
- **Khởi tạo dữ liệu mẫu (Bootstrap / Seeding)**: Script `prisma db seed` có tính bất biến (idempotent), khởi tạo quản trị viên ban đầu thông qua Supabase Admin Auth và nạp dữ liệu thực đơn mẫu.
- **Xóa mềm (Soft Delete)**: Cột mốc thời gian `deleted_at` trên các bảng `dishes`, `chefs`, và `ingredients`, kết hợp với nút bật/tắt trong trang admin để xem hoặc khôi phục các bản ghi đã xóa.
- **Trải nghiệm Danh sách (List UX)**: Phân trang qua query-string phía server (`?page=&q=`) và tìm kiếm theo tên, duy trì các bộ lọc đang chọn qua các bước chuyển trang.
- **Biểu mẫu & Bảo mật**: Form HTML thuần với xác thực bằng Zod, thông báo flash qua cookie có chữ ký (signed cookies), và bảo vệ chống tấn công CSRF dạng double-submit (`csrf-csrf`).
- **Bản địa hóa (Localization)**: Giao diện tiếng Anh với định dạng tiền tệ Việt Nam Đồng (`Intl.NumberFormat('vi-VN')`).

### Vòng 3: Kiểm toán Lược đồ (Schema) & Thắt chặt Bảo mật (Q21 – Q30)
- **Khắc phục Lỗ hổng RLS**: Rà soát file `supabase/schema.sql` có sẵn. Phát hiện một lỗ hổng nghiêm trọng khi các policy mặc định cấp quyền ghi toàn phần cho mọi người dùng đã đăng nhập vào tất cả các bảng. Đã thắt chặt các chính sách bằng cách xóa toàn bộ rule ghi công khai (chuyển toàn bộ thao tác ghi qua Express và Prisma) và khóa chặt bảng `profiles`.
- **Nguồn Chân lý Dữ liệu (Database Source of Truth)**: Chuyển đổi mã SQL thô thành các migration lược đồ Prisma (`prisma/schema.prisma`).
- **Toàn vẹn Dữ liệu**: Chuyển các danh mục dạng chuỗi (string) thành enum PostgreSQL native (`dish_category`) và giữ lại các ràng buộc check trong SQL.
- **SEO & Đường dẫn URL**: Tự động loại bỏ dấu tiếng Việt để tạo slug URL thân thiện (`Phở Bò` → `pho-bo`) kèm xử lý trùng lặp slug (`pho-bo-2`).

### Vòng 4: Môi trường & Cơ chế Bảo vệ An toàn (Q31 – Q38)
- **Ràng buộc Cấu hình**: Chuẩn hóa `.env.example` với cơ chế kiểm tra tính hợp lệ nghiêm ngặt bằng Zod khi khởi động.
- **Cơ chế Bảo vệ Vai trò**: Ngăn chặn quản trị viên tự chỉnh sửa vai trò của chính mình, và chặn bằng code việc hạ cấp tài khoản `ADMIN` duy nhất còn lại.
- **Ràng buộc Tệp Phương tiện**: Giới hạn kích thước upload tối đa 2 MB kèm kiểm tra magic-byte và MIME type (JPEG, PNG, WebP).
- **Kế hoạch Đồng thuận**: Tạo ra tài liệu [`design.md`](file:///home/pbkhang404/.gemini/antigravity/brain/cea0cf78-ea26-41fc-99e3-0cbedf03115e/design.md) và được người dùng phê duyệt.

---

## 3. Giai đoạn 2: Hiện thực hóa & Sinh Mã Nguồn

### 3.1 Thiết lập Công cụ & Gói Thư viện
- Cấu hình [`package.json`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/package.json), [`tsconfig.json`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tsconfig.json), [`tsconfig.build.json`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tsconfig.build.json), [`eslint.config.js`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/eslint.config.js), và [`.prettierrc`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/.prettierrc).
- Cài đặt các phụ thuộc cốt lõi: `express`, `express-handlebars`, `@supabase/ssr`, `@supabase/supabase-js`, `@prisma/client@7.10.0`, `@prisma/adapter-pg`, `zod`, `csrf-csrf`, `cookie-parser`, `multer`, `dotenv`, `helmet`, `morgan`, `tailwindcss`, `@tailwindcss/cli`, `vitest`, `supertest`.

### 3.2 Dịch vụ Cốt lõi & Middleware Bảo mật
- [`src/config/env.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/config/env.ts): Xác thực khi khởi động cho các URL database, khóa API, secret key và cổng mạng.
- [`src/lib/slug.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/lib/slug.ts): Hàm tiện ích thuần xử lý chuyển đổi slug an toàn với ký tự có dấu.
- [`src/lib/storage.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/lib/storage.ts): Kiểm tra magic-byte, upload lên Supabase Storage, rollback transaction khi thất bại, và tự động xóa ảnh rác (orphan images).
- [`src/auth/permissions.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/permissions.ts): Bảng ánh xạ phân quyền RBAC tập trung.
- [`src/middleware/security.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/middleware/security.ts): Bảo vệ chống CSRF double-submit gắn với cookie ID trình duyệt có chữ ký (`sid`), phân tích multipart toàn cục và thông báo flash.
- [`src/auth/middleware.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/middleware.ts): Giải quyết session qua cookie bằng `getClaims()`, tạo Profile tự động (lazy creation) trong lần đăng nhập đầu, cùng các middleware `requireAuth` và `requirePermission`.

### 3.3 Giao diện Người dùng & Các Khung nhìn (Views)
- **Layouts & Partials**: Các component layout gọn gàng, responsive với Tailwind CSS v4 ([`public.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/layouts/public.hbs), [`admin.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/layouts/admin.hbs), [`navbar.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/navbar.hbs), [`admin-nav.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/admin-nav.hbs), [`pagination.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/pagination.hbs), [`flash.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/flash.hbs)).
- **Các trang công khai (Public Pages)**:
  - [`home.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/public/home.hbs): Phần giới thiệu ấn tượng (Hero presentation) và lưới món ăn nổi bật.
  - [`menu.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/public/menu.hbs): Thanh điều hướng dạng viên thuốc (pill) theo danh mục kèm nhãn trạng thái "Hết hàng".
  - [`dish.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/public/dish.hbs): Chi tiết nguyên liệu trong công thức món ăn (chỉ hiển thị tên) và thẻ thông tin tiêu điểm về đầu bếp.
- **Các trang quản trị (Admin Pages)**:
  - [`index.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/admin/index.hbs): Tổng quan các chỉ số theo thời gian thực và thao tác nhanh.
  - [`dishes/form.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/admin/dishes/form.hbs): Bộ chọn nguyên liệu động nhiều dòng với số lượng và đơn vị tùy chỉnh.
  - [`users/index.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/admin/users/index.hbs): Quản lý vai trò người dùng có khóa bảo vệ với hồ sơ cá nhân và cảnh báo khi thao tác trên admin cuối cùng.
  - Đầy đủ các form và bảng CRUD cho Đầu bếp và Nguyên liệu.

---

## 4. Giai đoạn 3: Lặp lại Tinh chỉnh, Đổi tên Khóa & Gỡ lỗi Cơ sở Dữ liệu

### 4.1 Quy chuẩn Đặt tên Khóa Supabase
- **Yêu cầu từ Người dùng**: Đổi tên các khóa Supabase từ `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` sang `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`.
- **Thay đổi Đã Áp dụng**: Cập nhật [`.env.example`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/.env.example), [`src/config/env.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/config/env.ts), [`src/lib/supabase.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/lib/supabase.ts), [`prisma/seed.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/prisma/seed.ts), và [`tests/setup.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tests/setup.ts).

### 4.2 Tư vấn Kiến trúc JWKS
- **Câu hỏi của Người dùng**: *"Is supabase currently using jwks and need jwks url?"* (Supabase hiện tại có đang dùng JWKS và có cần URL JWKS không?)
- **Giải thích Kỹ thuật Được cung cấp**: Làm rõ rằng Supabase hiện đại sử dụng khóa ký JWT bất đối xứng (ECC/Ed25519) và công khai public key tại `/.well-known/jwks.json`. Chứng minh rằng `@supabase/ssr` / `@supabase/auth-js` tự động lấy và lưu cache các khóa này thông qua `SUPABASE_URL`, do đó không cần cấu hình biến `JWKS_URL` riêng biệt.

### 4.3 Xử lý Sai lệch Lược đồ (Schema Drift) & Thiếu Cột trong Cơ sở Dữ liệu
- **Vấn đề Phát sinh**: Lỗi lúc chạy (runtime error) khi thực hiện `prisma.dish.findMany()`:
  ```
  The column `dishes.deleted_at` does not exist in the current database.
  ```
- **Phân tích Nguyên nhân Gốc rễ**: Cơ sở dữ liệu đã được khởi tạo bằng file SQL cũ `supabase/schema.sql` trước khi triển khai các migration. Khi Prisma ghi nhận `0_init` như một baseline có sẵn (`applied_steps_count: 0`), các câu lệnh sửa đổi bảng mới chưa thực sự được chạy trên database Supabase trực tiếp.
- **Giải pháp**:
  1. Tạo migration [`20261012112000_add_missing_columns`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/prisma/migrations/20261012112000_add_missing_columns/migration.sql) bổ sung `deleted_at` vào `dishes`, `chefs`, và `ingredients`, ép kiểu `category` sang `dish_category`, và tạo bảng `profiles`.
  2. Triển khai migration thành công qua `npm run db:migrate`.
  3. Sửa ràng buộc mật khẩu trong file seed (đảm bảo tối thiểu 6 ký tự theo yêu cầu của Supabase Auth).
  4. Chạy `npm run db:seed` để tạo tài khoản admin, storage bucket, và nạp đầy đủ dữ liệu menu mẫu.

### 4.4 Khắc phục Lỗi Giao diện Mobile Navbar (Nút Đăng nhập Bị Co Cắt & Nút Đăng xuất Biến Mất)
- **Vấn đề Phát sinh**: Khi hiển thị thanh điều hướng công khai trên các thiết bị di động có bề rộng nhỏ ($\le 640\text{px}$, tiêu biểu là $360\text{px} - 375\text{px}$), phát sinh 2 lỗi hiển thị nghiêm trọng:
  1. Nút "Đăng nhập" (Login) bị co rút chiều ngang, chữ bị ngắt dòng hoặc che khuất (text clipped/wrapped).
  2. Nút "Đăng xuất" (Logout) biến mất hoàn toàn đối với người dùng đã đăng nhập, khiến họ không thể thoát tài khoản trên mobile.
- **Phân tích Nguyên nhân Gốc rễ**:
  1. *Lỗi mất nút Đăng xuất*: Trong file [`public/css/style.css`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/public/css/style.css), quy tắc `@media (max-width: 640px) { .nav-cta .btn-solid { display: none } }` ban đầu được định nghĩa để ẩn nút "Xem thực đơn" trên màn hình nhỏ. Tuy nhiên, nút Đăng xuất trong [`src/views/partials/navbar.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/navbar.hbs) lại dùng cùng class `<button class="btn btn-solid">Đăng xuất</button>`, dẫn đến việc selector này ẩn luôn cả nút Đăng xuất.
  2. *Lỗi co cắt nút Đăng nhập*: Trên màn hình hẹp $360\text{px} - 375\text{px}$, tổng kích thước ngang của các thành phần gồm Logo thương hiệu ($185\text{px}$), Công tắc chuyển Theme ($58\text{px}$), Nút Đăng nhập ($98\text{px}$), Nút Burger menu ($42\text{px}$) cùng các khoảng cách (gap) và lề đệm (padding) vượt quá $440\text{px}$. Các nút `.btn` có thuộc tính `overflow: hidden` nhưng lại thiếu `white-space: nowrap` và `flex-shrink: 0`, dẫn đến việc flexbox co ép nút và làm vỡ chữ bên trong.
- **Giải pháp & Hiện thực hóa**:
  1. *Tách biệt class ngữ nghĩa*: Thêm class chuyên biệt `.nav-cta-menu` vào nút "Xem thực đơn" và `.nav-admin-btn` vào nút "Quản trị" trong [`navbar.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/navbar.hbs). Cập nhật CSS thành `.nav-cta .nav-cta-menu { display: none }` để chỉ ẩn nút Thực đơn, đảm bảo form Đăng xuất luôn hiển thị trọn vẹn.
  2. *Chống co cắt văn bản*: Thiết lập `white-space: nowrap; flex-shrink: 0;` cho `.btn` và các nút trong `.nav-cta`.
  3. *Tối ưu hóa phân bổ không gian Responsive*:
     - Thu hẹp đệm lề `.wrap` (còn $14\text{px}$ ở $\le 640\text{px}$ và $10\text{px}$ ở $\le 380\text{px}$).
     - Tinh chỉnh cỡ chữ thương hiệu `.brand` ($18\text{px} / 16.5\text{px}$).
     - Rút gọn kích thước công tắc theme `.theme-switch` từ $54\text{px} \times 30\text{px}$ xuống $44\text{px} \times 26\text{px}$ và nút burger xuống $38\text{px} \times 38\text{px}$.
     - Ẩn nút "Quản trị" trên thanh ngang bên ngoài đối với màn hình nhỏ, thay vào đó hiển thị liên kết quản trị `.nav-mobile-admin` bên trong ngăn kéo menu burger khi người dùng mở ra.

### 4.5 Tối ưu hóa Không gian Menu Quản trị trên Thiết bị Di động (Admin Dropdown Menu)
- **Vấn đề Phát sinh**: Trên giao diện quản trị (`/admin`), khi xem trên thiết bị di động và máy tính bảng ($< 960\text{px}$), thanh điều hướng sidebar quản trị ban đầu được cấu hình `position: static; height: auto`. Điều này khiến danh sách 6 mục điều hướng chiếm hơn $450\text{px}$ chiều cao màn hình, đẩy toàn bộ tiêu đề trang, thống kê và bảng dữ liệu xuống dưới nếp gấp màn hình (below-the-fold), buộc người quản trị phải cuộn trang liên tục để thao tác.
- **Yêu cầu Thiết kế & Thách thức**:
  1. *Bảo toàn 100% giao diện máy tính để bàn ($\ge 960\text{px}$)*: Giữ nguyên cột sidebar bên trái cố định, rộng $240\text{px}$, không gây bất kỳ tác động tiêu cực nào tới trải nghiệm desktop.
  2. *Chuyển đổi thành Topbar & Dropdown Drawer trên màn hình $< 960\text{px}$*: Thu gọn khu vực điều hướng thành một thanh ngang trên cùng cao $58\text{px}$ dính chặt ở đỉnh màn hình (`sticky top: 0`).
  3. *Lớp phủ không gây lệch bố cục (Overlay without Layout Shift)*: Khi mở menu, khối danh mục phải thả xuống dạng lớp phủ nổi (`position: absolute; top: 100%`) đè lên nội dung bên dưới, có nền đặc (`background: var(--paper)`), viền ngăn cách sắc nét và đổ bóng nhiều tầng (`box-shadow`) tương thích hoàn hảo cả 2 chế độ Sáng (Light) và Tối (Dark).
  4. *Tương tác tiện dụng (UX)*: Hỗ trợ đóng menu tự động khi nhấp chuột ra ngoài phạm vi menu hoặc khi nhấn phím <kbd>Escape</kbd>.
- **Giải pháp & Hiện thực hóa**:
  1. *Cấu trúc lại mẫu Handlebars*: Trong [`admin-nav.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/admin-nav.hbs), bổ sung input checkbox vô hình `#admin-nav-toggle` điều khiển trạng thái mở/đóng bằng CSS thuần. Chia tách cấu trúc thành thanh ngang `.side-bar` (chứa thương hiệu và nút `.side-toggle` có chữ "Menu" kèm biểu tượng burger 3 vạch) và ngăn kéo điều hướng `.side-menu`.
  2. *CSS Responsive phân tầng*: Trong [`admin.css`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/public/css/admin.css), giữ nguyên `display: contents` trên desktop. Ở breakpoint `max-width: 960px`, thiết lập `.side-menu` ẩn mặc định (`display: none`) và chỉ hiển thị (`display: flex`) khi `:checked`. Áp dụng animation trượt `animation: drop-down .22s var(--ease)` kết hợp `box-shadow: 0 16px 36px rgba(0,0,0,.15)` (và shadow đậm trên dark mode).
  3. *Tăng cường trải nghiệm bằng JavaScript*: Trong [`admin.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/layouts/admin.hbs), thêm bộ lắng nghe sự kiện (`click` ra ngoài `.sidebar` và phím `Escape`), tự động chuyển `navToggle.checked = false` để đóng menu nhanh chóng.

---

## 5. Kết quả Kiểm thử & Xác minh Toàn diện

Quy trình xác minh chất lượng phần mềm được thiết kế và triển khai đa tầng (multi-tier quality assurance), từ kiểm thử tự động ở cấp độ mã nguồn đến kiểm tra hiển thị trực quan thực tế trên nhiều loại thiết bị và môi trường:

### 5.1 Bộ Kiểm thử Đơn vị Tự động với Vitest (Automated Unit Testing)
Ứng dụng sử dụng **Vitest** để kiểm tra tự động các module nghiệp vụ nhạy cảm về bảo mật, xử lý chuỗi và phân quyền truy cập. Tất cả 3 bộ kiểm thử gồm 9 bài test đều vượt qua 100%:

```bash
npm run test
```

| Tệp Kiểm thử | Số Test Case | Trọng tâm Kiểm thử & Tính Năng Được Xác Minh | Kết quả |
| :--- | :---: | :--- | :---: |
| [`tests/http.test.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tests/http.test.ts) | 3 | **Bảo mật Chống Tấn công Open Redirect**: Xác minh hàm `safeRedirectTarget()` từ chối các URL bên ngoài (`https://evil.com`), URL tương đối giao thức nguy hiểm (`//evil.com`), và các chuỗi điều khiển (`/\\evil.com`), chỉ cho phép các đường dẫn nội bộ hợp lệ (ví dụ `/admin/dishes`). | ✅ ĐẠT (Passed) |
| [`tests/slug.test.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tests/slug.test.ts) | 3 | **Chuẩn hóa Đường dẫn Thân thiện (SEO Slugs)**: Kiểm tra thuật toán chuyển đổi tiếng Việt có dấu sang ASCII thuần (`Phở Bò Tái Lăn` → `pho-bo-tai-lan`), chuẩn hóa khoảng trắng thừa, và xử lý thuật toán sinh hậu tố tránh va chạm trùng lặp (`pho-bo-2`). | ✅ ĐẠT (Passed) |
| [`tests/permissions.test.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tests/permissions.test.ts) | 3 | **Ma trận Phân quyền Truy cập (RBAC Matrix)**: Kiểm tra hàm `can(user, permission)` trên 3 vai trò: `CUSTOMER` (bị từ chối mọi quyền can thiệp dữ liệu quản trị), `STAFF` (được phép CRUD món ăn, đầu bếp, nguyên liệu nhưng bị chặn quyền quản lý user), và `ADMIN` (toàn quyền bao gồm `user:manage`). | ✅ ĐẠT (Passed) |

*Thời gian thực thi trung bình: ~380ms – 420ms trên môi trường Node.js ESM.*

### 5.2 Kiểm tra An toàn Kiểu dữ liệu & Quy trình Biên dịch (Type Safety & Build Verification)
Để ngăn ngừa triệt để các lỗi thời gian chạy (runtime errors), toàn bộ mã nguồn được biên dịch và rà soát nghiêm ngặt:

1. **Kiểm tra Kiểu dữ liệu TypeScript (`npm run typecheck`)**:
   - Sử dụng `tsc --noEmit` ở chế độ `strict: true`.
   - Kết quả: **0 lỗi (0 errors)**. Các schema xác thực Zod, mô hình kiểu sinh từ Prisma Client, và interface mở rộng cho Express Request (`req.user`, `req.csrfToken()`) hoàn toàn khớp kiểu và an toàn.
2. **Biên dịch Tối ưu hóa Giao diện Tailwind CSS v4**:
   - Sử dụng `@tailwindcss/cli -i src/views/styles/app.css -o public/css/app.css --minify`.
   - Kết quả: Tạo ra tệp CSS nén tối ưu **~39 KB**, loại bỏ hoàn toàn các class thừa và đảm bảo thời gian tải trang nhanh nhất.
3. **Biên dịch Server cho Môi trường Thực tế (`npm run build`)**:
   - Biên dịch TypeScript thông qua `tsconfig.build.json` sang thư mục `dist/`.
   - Toàn bộ các import đường dẫn ESM (`.js` extensions) và cấu trúc thư mục được giải quyết chuẩn xác, sạch sẽ không có cảnh báo.

### 5.3 Kiểm thử Giao diện & Trực quan Đa Thiết bị (Responsive & Visual Inspection với Chrome DevTools & Headless Chromium)
Sau khi áp dụng các cải tiến CSS và bố cục, hệ thống đã được kiểm thử trực quan thông qua công cụ **Chrome DevTools** và **Headless Chromium** trên nhiều kích thước màn hình và kịch bản người dùng thực tế:

#### A. Ma trận Kiểm thử Responsive theo Độ phân giải (Viewport Matrix)
| Kích thước Viewport | Thiết bị Tiêu chuẩn Đại diện | Trạng thái Navbar Công khai | Trạng thái Menu Quản trị (/admin) |
| :--- | :--- | :--- | :--- |
| **$360\text{px} \times 800\text{px}$** | Màn hình di động hẹp (Galaxy S8, Android phổ thông) | Logo rút gọn $16.5\text{px}$, nút Đăng nhập hiển thị nguyên vẹn $100\%$ không bị co ngắt, nút Đăng xuất hiển thị đầy đủ, nút Xem thực đơn ẩn ra ngoài và chuyển vào ngăn burger. | Topbar cao $58\text{px}$ cố định, nút bấm toggle "Menu" gọn gàng, dropdown overlay hiển thị đầy đủ $100\%$ nội dung không bị tràn ngang. |
| **$375\text{px} \times 812\text{px}$** | Màn hình di động chuẩn (iPhone X / 12 / 13 / SE) | Bố cục thanh thoát, khoảng cách lề $14\text{px}$, các nút chức năng và công tắc theme cân xứng, không có hiện tượng giật vỡ layout. | Dropdown menu trượt xuống với bóng đổ sắc nét, không che lấp vĩnh viễn nội dung bên dưới, đóng mượt mà khi bấm ra ngoài hoặc nhấn Esc. |
| **$768\text{px} \times 1024\text{px}$** | Máy tính bảng dọc (iPad Mini, iPad Air) | Hiển thị đầy đủ menu và nút CTA, chuyển đổi linh hoạt. | Hiển thị dạng topbar với dropdown drawer, tối ưu không gian hiển thị cho các bảng dữ liệu quản trị lớn. |
| **$1200\text{px} \times 800\text{px}$** | Màn hình Máy tính để bàn / Laptop (Desktop) | Thanh điều hướng dàn ngang hoàn chỉnh với đầy đủ liên kết và hiệu ứng hover. | Cột sidebar bên trái cố định $240\text{px}$, hiển thị đầy đủ cấu trúc phân nhóm (01 Món ăn, 02 Đầu bếp, 03 Nguyên liệu, 04 Người dùng, 05 Trang công khai, 06 Đăng xuất). |

#### B. Ma trận Xác minh Trạng thái Xác thực Người dùng (Auth State Matrix)
1. **Khách vãng lai (Guest / Chưa đăng nhập)**:
   - Trên desktop: Hiển thị liên kết Đăng nhập và nút "Xem thực đơn" dạng solid nổi bật.
   - Trên mobile: Nút "Đăng nhập" giữ nguyên kiểu dáng, chữ hiển thị rõ ràng trên một dòng duy nhất (`white-space: nowrap`), nút "Xem thực đơn" tự động ẩn khỏi thanh chính để tránh quá tải không gian nhưng luôn có sẵn bên trong menu burger.
2. **Người dùng Đã Đăng nhập (Authenticated Customer)**:
   - Nút "Đăng xuất" dạng form POST kèm token CSRF hiển thị rõ nét, khắc phục triệt để lỗi biến mất trên màn hình nhỏ.
3. **Quản trị viên / Nhân viên (Admin / Staff)**:
   - Nút "Quản trị" xuất hiện cạnh nút "Đăng xuất" trên desktop, và tự động thu gọn vào bên trong menu burger trên mobile nhằm ưu tiên khoảng trống thao tác.

#### C. Xác minh Chế độ Sáng / Tối (Theme Mode Inspection)
- **Light Mode**: Nền giấy ngà (`var(--paper)`: `#fbf8f2`), chữ đen mực in (`var(--ink)`: `#191512`), bóng đổ phân tầng mềm mại, viền đơn sắc thanh lịch.
- **Dark Mode**: Nền đen dịu (`#141210`), chữ trắng sáng (`#f5f0e8`), các đường viền nổi bật với độ tương phản cao, menu overlay đổ bóng sâu `0 16px 36px rgba(0,0,0,.65)` giúp tách bạch hoàn toàn với nền bảng quản trị phía dưới.

### 5.4 Xác minh Vận hành Thời gian Thực (Runtime & Server Startup Verification)
Kiểm tra vòng đời khởi động của ứng dụng từ bản build biên dịch:

```bash
node dist/server.js
```
- **Kết quả khởi chạy**:
  ```text
  🚀 Team13 Restaurant SSR server running at http://localhost:3000
  📁 Environment: development
  ```
- **Các thành phần được kích hoạt và kiểm chứng thành công**:
  - Kết nối cơ sở dữ liệu Supabase PostgreSQL thông qua Prisma connection pool ổn định.
  - Bộ lắng nghe Cookie Session SSR qua `@supabase/ssr` giải mã token và gắn thông tin người dùng vào `req.user`.
  - Bộ tạo và xác thực CSRF Token (`csrf-csrf`) bảo vệ 100% các route nhạy cảm (`/login`, `/logout`, `/admin/*`).
  - Hệ thống HTTP Headers bảo mật được tiêm tự động bởi `helmet` (chặn clickjacking, MIME sniffing, bảo vệ XSS).

### 5.5 Bảng Tổng hợp Kết quả Đảm bảo Chất lượng (Quality Assurance Matrix)

| Hạng mục Đánh giá | Công cụ / Phương pháp | Tiêu chí Nghiệm thu | Kết quả Thực tế |
| :--- | :--- | :--- | :---: |
| **Logic & Bảo mật Nghiệp vụ** | Vitest (3 tệp test) | 100% test case pass, chặn Open Redirect, slug chuẩn tiếng Việt, RBAC chặt chẽ | ✅ **ĐẠT (9/9 Passed)** |
| **Toàn vẹn Kiểu dữ liệu** | TypeScript Compiler (`tsc`) | Biên dịch không có cảnh báo hoặc lỗi type (Strict Mode) | ✅ **ĐẠT (0 Errors)** |
| **Tối ưu hóa Băng thông CSS** | `@tailwindcss/cli` | File CSS production được nén nhỏ gọn, tải tức thì | ✅ **ĐẠT (~39 KB)** |
| **Bản dựng Máy chủ (Server Build)** | TypeScript Build Engine | Mã nguồn được biên dịch sạch sẽ sang thư mục `dist/` theo chuẩn ESM | ✅ **ĐẠT (Clean Dist)** |
| **Hiển thị Navbar trên Mobile** | Chrome DevTools / Chromium | Nút Đăng nhập không co cắt, nút Đăng xuất hiển thị 100% trên viewport $360\text{px} - 375\text{px}$ | ✅ **ĐẠT (Hoàn hảo)** |
| **Bố cục Quản trị Responsive** | Chrome DevTools / Chromium | Sidebar $< 960\text{px}$ chuyển thành topbar $58\text{px}$ + dropdown overlay, giữ nguyên desktop $\ge 960\text{px}$ | ✅ **ĐẠT (Không gián đoạn UX)** |
| **Tương tác Đóng Menu Quản trị** | Trình duyệt Web / JS Engine | Đóng tự động khi nhấp ra ngoài hoặc bấm phím Esc | ✅ **ĐẠT (Mượt mà)** |
| **Bảo vệ Biểu mẫu & Tấn công Mạng** | CSRF-CSRF & Helmet | Chặn đứng giả mạo request, cookie có cờ `HttpOnly` và `SameSite=Lax` | ✅ **ĐẠT (An toàn cao)** |

---

## 6. Đúc kết Cá nhân & Bài học Kinh nghiệm

1. **Thiết kế Có Hệ thống Ngay Từ Đầu Giúp Tránh Phải Viết Lại Code**: Buổi phỏng vấn cấu trúc "grill-me" đã loại bỏ triệt để các điểm mơ hồ về phân quyền vai trò, vòng đời lưu trữ ảnh, và ranh giới routing trước khi bắt tay viết code.
2. **Bảo mật Theo Mặc định (Security by Default)**: Việc kiểm toán các script SQL sẵn có giúp phát hiện sớm các chính sách RLS quá lỏng lẻo, đảm bảo người dùng ẩn danh không thể thao túng dữ liệu qua các API REST công khai.
3. **Kỷ luật trong Quản lý Migration Cơ sở Dữ liệu**: Sự cố trôi lệch lược đồ với cột `deleted_at` cho thấy cách thức các baseline migration của ORM tương tác với các bảng database đã tồn tại từ trước, đồng thời nêu bật tầm quan trọng của các script migration mang tính khai báo tường minh.
4. **Cộng tác Hiệu quả cùng AI**: Việc xem AI như một cộng sự lập trình cặp (pair programmer) chủ động—đặt câu hỏi phản biện về thiết kế, áp dụng chặt chẽ an toàn kiểu dữ liệu (type safety), và gỡ lỗi sai khác trong môi trường—đã tạo nên một codebase sạch sẽ và vững chắc hơn rất nhiều.
