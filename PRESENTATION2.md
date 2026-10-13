# Team13 Restaurant — Tài liệu thuyết trình

- **Môn học**: Phát triển ứng dụng Web (CSC13008) — HCMUS
- **Nhóm 13**: Phan Bình Khang · Nguyễn Minh Đức · Hy Huê Hưng
- **Ngày**: 13/10/2026
- **Demo**: `http://localhost:3000` (xem thêm [README](../README.md))

> Tài liệu tổng hợp từ code và 3 báo cáo AI usage trong `docs/`:
> [`AI_USAGE_KHANG.md`](AI_USAGE_KHANG.md) · [`AI_PROMPT_REPORT.md`](AI_PROMPT_REPORT.md) · [`AI_USAGE_HUNG.md`](AI_USAGE_HUNG.md).

---

## 1. Sản phẩm

Web nhà hàng SSR với 2 cổng trên cùng một ứng dụng Express:

| Cổng | Route | Chức năng |
|---|---|---|
| Public (`/`) | `/`, `/menu`, `/dishes/:slug` | Trang chủ (món nổi bật, hero, ticker), thực đơn theo danh mục + tìm kiếm/sắp xếp, chi tiết món (giá VND, nguyên liệu, thẻ đầu bếp + modal) |
| Admin (`/admin`) | `/admin`, `/admin/dishes`, `/admin/chefs`, `/admin/ingredients`, `/admin/users` | Dashboard số liệu, CRUD món/công thức (form PATCH/DELETE + trang xác nhận xóa), quản lý bếp, tồn kho, phân quyền user |

Dữ liệu live (13/10/2026): **16 món · 7 đầu bếp · 31 nguyên liệu · 3 tài khoản**.

## 2. Đội ngũ (từ git history + 3 AI docs)

| Thành viên | Mảng chính | Đóng góp nổi bật |
|---|---|---|
| Phan Bình Khang | Kiến trúc + backend lõi | Phỏng vấn kiến trúc 38 quyết định, env/slug/storage/RBAC/middleware, vá RLS, đưa SQL về migration Prisma |
| Nguyễn Minh Đức | UI/UX | Mockup thành SSR, hero/ticker, dark theme, animation hover, font Việt, skeleton, search/filter/sort |
| Hy Huê Hưng | Vận hành + validation | Dựng DB, ảnh món 12/12, modal bếp + avatar, rà soát validation, viết thêm test |

## 3. Tech stack

- **Backend/SSR**: Express 5 + `express-handlebars` (2 layout `public`/`admin`), TypeScript strict (NodeNext ESM)
- **CSS**: Tailwind CSS v4 (form admin) + `style.css`/`admin.css` viết tay (design system, dark/light theme)
- **Data**: PostgreSQL qua Supabase + Prisma ORM 7 (`@prisma/adapter-pg`); Auth Supabase (cookie session); Storage bucket `images`
- **An toàn**: Zod validation, CSRF double-submit (`csrf-csrf`), `helmet`, rate-limit tự viết, upload kiểm tra magic-byte
- **Kiểm thử**: Vitest, `tsc --noEmit`, render thử template, gọi thử request live

## 4. Workflow phát triển

```
npm install → điền .env → prisma migrate deploy → prisma db seed
→ npm run dev (server + tailwind watch) → code trên nhánh feat/*
→ npm run test + typecheck → PR vào main → review → merge
```

- Env kiểm tra lúc boot bằng Zod (`src/config/env.ts`): thiếu key là app báo đúng tên field rồi dừng.
- Mọi thay đổi DB đi qua migration Prisma có version (`prisma/migrations/`).
- Lịch sử gần nhất: UI/UX → validation A–H → modal/avatar → dashboard admin → CRUD PATCH/DELETE + trang xác nhận xóa.

## 5. Workflow runtime (vòng đời request)

**Xem món**: click ở `/menu` → `GET /dishes/:slug` → đọc định danh từ path param → query Prisma (lọc `deletedAt`, ẩn bếp nghỉ) → render HBS. Reload/back/gửi link đều ra đúng món.

**CRUD admin**: form POST (+`?_method=PATCH/DELETE`) → CSRF → multer (trần 5MB) → Zod (lỗi thì trả 400/422 và giữ lại dữ liệu đã nhập) → kiểm tra trùng (slug, trùng dòng, trùng hoa/thường) → `saveWithImage` (upload trước, DB lỗi thì xóa ảnh vừa up) → flash + redirect 303 (reload không lặp thao tác). Xóa là soft-delete, có trang xác nhận riêng (trang GET chỉ để hiển thị).

**Upload ảnh**: chọn file → multer memory → `validateImage` (JPEG/PNG/WebP, magic bytes, ≤2MB) → `storage/images/<folder>/<uuid>.<ext>` → public URL → lưu cột `image_url`; đổi/xóa ảnh thì xóa object cũ, lỗi thì bỏ qua.

**Auth**: đăng ký/đăng nhập qua Supabase Auth → cookie session → `loadUser` verify JWT + lazy-tạo `profiles` (mặc định CUSTOMER) → guard `requirePermission` theo bảng quyền. Chỉ ADMIN có `admin:access` (STAFF cũng không vào `/admin`).

## 6. Data model

```
chefs 1───* dishes *───* ingredients   (qua dish_ingredients: quantity, unit)
profiles (id = auth.users.id; role ADMIN/STAFF/CUSTOMER)
```

- `chefs`: tên, avatar, chuyên môn, tiểu sử, năm KN, SĐT, `is_active` + soft-delete
- `dishes`: tên, slug duy nhất (SEO tiếng Việt, trùng thì thêm `-2`), giá, category (enum PG), ảnh, bếp (nullable, xóa bếp thì set null)
- `ingredients`: tên duy nhất, đơn vị, tồn kho, giá vốn, ảnh
- Ràng buộc CHECK (giá ≥ 0, số lượng > 0, KN ≥ 0) + RLS public chỉ đọc.

## 7. Mọi quyết định — kiến trúc & backend

| # | Quyết định | Phương án loại | Lý do |
|---|---|---|---|
| 1 | SSR (Express + Handlebars) | SPA React/Vue | SEO, chạy không cần JS, đúng yêu cầu môn học |
| 2 | TypeScript strict + ESM | JS thuần | Bắt lỗi sớm, typecheck 0 lỗi duy trì |
| 3 | Supabase + Prisma 7 | SQL thô / ORM khác | Auth + Storage + Postgres một nơi; migration có version |
| 4 | URL món bằng slug | `/dishes/1` số | SEO + đẹp; vẫn đọc định danh từ path như slide tuần 3 |
| 5 | ID nội bộ UUID, ID bậy trả 404 | Để Prisma ném 500 | Trang 404 thay vì sập trang (`paramId`) |
| 6 | 1 bucket `images` + thư mục | 3 bucket rời | Seed tự tạo được, code gọn |
| 7 | Chỉ ADMIN vào `/admin` | STAFF quản trị nội dung | Giảm bề mặt rủi ro |
| 8 | Soft-delete + khôi phục + trang xác nhận | Xóa cứng / xóa ngay ở list | An toàn hơn; GET không xóa dữ liệu |
| 9 | Sửa/xóa qua PATCH/DELETE + 303 | POST chung chung | Đúng ngữ nghĩa HTTP, reload an toàn |
| 10 | Profile lazy-create, mặc định CUSTOMER | Gán role tay | Đăng ký xong dùng ngay |
| 11 | Validation 3 lớp (client, Zod 422, CHECK/PK/FK) | Chỉ 1 lớp | Mỗi lớp chặn một kiểu lỗi, ví dụ case trùng nguyên liệu |
| 12 | Ảnh thật Openverse/Flickr + Unsplash | Ảnh mock | License mở, không API key |
| 13 | Rate-limit tự viết cho login/register | Không giới hạn / thêm lib | Chống brute-force mà không cần thêm lib |
| 14 | Key Supabase tên mới + fallback tên cũ | Một tên duy nhất | Tương thích dashboard mới và code cũ |
| 15 | Feature-branch + PR vào main | Push thẳng main | Review được, lịch sử sạch |

## 8. Mọi quyết định — UI/UX & vận hành

| # | Quyết định | Phương án loại | Lý do |
|---|---|---|---|
| 16 | Không AJAX, form GET/POST thuần | Fetch client | Đơn giản, CSRF dễ, đúng SSR |
| 17 | Tailwind (form) + CSS viết tay (site) | Một hệ duy nhất | Form nhanh, site theo design riêng |
| 18 | Dark/light bằng CSS checkbox + localStorage | Toggle JS framework | Không JS, persist được, có View Transitions |
| 19 | Font 100% tiếng Việt (Playfair + Be Vietnam Pro + IBM Plex Mono) | Font mặc định | Đã kiểm tra subset `vietnamese` trên Google Fonts |
| 20 | Bỏ mọi zoom ảnh hover; skeleton thuần CSS | Zoom + spinner JS | Mượt, nhẹ, không layout-shift |
| 21 | Modal chi tiết bếp (`<dialog>`) + avatar fallback FB-style | Trang bếp riêng / ảnh mặc định chung | Xem nhanh không cần chuyển trang; thiếu ảnh thật vẫn đồng nhất |
| 22 | Form Việt hóa, lỗi từng field, giữ dữ liệu khi 422 | Tiếng Anh / mất dữ liệu | Dễ dùng hơn, nhập sai không phải gõ lại |
| 23 | Search/filter/sort phía server qua query | Lọc client | SEO + share URL kết quả được |

## 9. Hành trình UI/UX (từ nhật ký prompt của Đức)

Bắt đầu từ mockup HTML/CSS rồi port thành view SSR nối backend thật. Sau đó làm dần từng phần: hero tách đôi kèm ticker, theme sáng/tối, animation hover, sửa núm toggle, bỏ zoom ảnh, fix skeleton, fix lỗi font, đổi font Việt, responsive rồi thêm search/filter/sort. Mỗi lần chỉ chỉnh một ý rồi chạy thử live trước khi sang ý tiếp theo.

## 10. AI usage — 3 thành viên

- **Khang** ([`AI_USAGE_KHANG.md`](AI_USAGE_KHANG.md), Antigravity): làm kiến trúc theo kiểu hỏi đáp 38 quyết định rồi mới code backend lõi, rà soát và vá RLS, chuyển SQL về migration Prisma, gỡ lỗi `deleted_at` drift.
- **Đức** ([`AI_PROMPT_REPORT.md`](AI_PROMPT_REPORT.md)): nhật ký 17 prompt UI/UX, chỉ sửa views + CSS, gặp lỗi thì dán lỗi gốc để tìm nguyên nhân (giữ Be Vietnam Pro, bỏ zoom ảnh).
- **Hưng** ([`AI_USAGE_HUNG.md`](AI_USAGE_HUNG.md), OpenCode + Muse Spark): dựng DB, gắn ảnh món 12/12 + sửa ảnh gỏi cuốn, sửa lỗi boot, làm modal/avatar, rà soát validation, viết test (hiện 32 tests).

## 11. Kiểm chứng (số liệu chạy thật ngày 13/10/2026)

```bash
npm run test       # 8 files, 32/32 passed
npm run typecheck  # 0 lỗi
```

- Render thử template với dữ liệu mẫu: modal/avatar, form món/bếp/nguyên-liệu/register đều pass.
- Chạy thử `dev:server`: `/`, `/menu`, `/login`, `/register`, `/dishes/pho-bo-dac-biet` đều HTTP 200; CSS mới load đủ; không lộ SĐT.
- ID bậy/slug lạ → 404 đúng; `/dishes/2` → 404 đúng thiết kế (dùng slug).

## 12. Hướng dẫn demo (5 phút)

1. `/` — hero, món nổi bật, ticker, bật/tắt theme.
2. `/menu?q=pho` — tìm kiếm, lọc danh mục, sắp xếp giá/tên.
3. `/dishes/pho-bo-dac-biet` — nhấn tên/avatar bếp → modal (đóng bằng ×/nền/Esc).
4. Đăng nhập ADMIN → `/admin` — dashboard, CRUD món (thử trùng nguyên liệu → 422), quản lý bếp/kho/users, trang xác nhận xóa.
5. `/dishes/abc` → trang 404.

## 13. Việc chưa xong & rút kinh nghiệm

- Chưa test tay: submit form admin, trùng tên hoa/thường, rate-limit, upload file quá 5MB.
- Vài điều rút ra: validate nên làm nhiều lớp để lỗi hiện rõ ràng; đổi DB thì đi qua migration Prisma thay vì sửa tay; trang GET không được làm đổi dữ liệu; render thử template bằng dữ liệu mẫu trước khi mở trình duyệt kiểm tra.
