# Team13 Restaurant — Tài liệu thuyết trình

- **Môn học**: Phát triển ứng dụng Web (CSC13008) — HCMUS
- **Nhóm 13**: Phan Bình Khang · Nguyễn Minh Đức · Hy Huê Hưng
- **Ngày**: 13/10/2026
- **Demo**: `http://localhost:3000` (xem thêm [README](../README.md))

> Tài liệu này tổng hợp từ code, số liệu chạy thật và 3 báo cáo AI usage trong `docs/`:
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
| Hy Huê Hưng | Vận hành + validation | Dựng DB qua MCP, ảnh món 12/12, modal bếp + avatar, audit validation A–H, test 27→32 |

## 3. Tech stack

- **Backend/SSR**: Express 5 + `express-handlebars` (2 layout `public`/`admin`), TypeScript strict (NodeNext ESM)
- **CSS**: Tailwind CSS v4 (form admin) + `style.css`/`admin.css` viết tay (design system, dark/light theme)
- **Data**: PostgreSQL qua Supabase + Prisma ORM 7 (`@prisma/adapter-pg`); Auth Supabase (cookie session); Storage bucket `images`
- **An toàn**: Zod validation, CSRF double-submit (`csrf-csrf`), `helmet`, rate-limit tự viết, upload kiểm tra magic-byte
- **Kiểm thử**: Vitest, `tsc --noEmit`, check render template, probe live

## 4. Workflow phát triển

```
npm install → điền .env → prisma migrate deploy → prisma db seed
→ npm run dev (server + tailwind watch) → code trên nhánh feat/*
→ npm run test + typecheck → PR vào main → review → merge
```

- Chuẩn env kiểm tra lúc boot bằng Zod (`src/config/env.ts`): thiếu key là app từ chối chạy kèm tên field.
- Mọi thay đổi DB đi qua migration Prisma có version (`prisma/migrations/`).
- Lịch sử gần nhất: UI/UX → validation A–H → modal/avatar → dashboard admin → CRUD PATCH/DELETE + trang xác nhận xóa.

## 5. Workflow runtime (vòng đời request)

**Xem món**: click ở `/menu` → `GET /dishes/:slug` → đọc định danh từ path param → query Prisma (lọc `deletedAt`, ẩn bếp nghỉ) → render HBS. Reload/back/gửi link đều ra đúng món.

**CRUD admin**: form POST (+`?_method=PATCH/DELETE`) → CSRF → multer (trần 5MB) → Zod (lỗi → 400/422 render lại giữ dữ liệu) → kiểm tra trùng (slug/dedup/dup hoa-thường) → `saveWithImage` (upload trước, DB lỗi thì rollback ảnh) → flash + **303 redirect** (reload không lặp thao tác). Xóa là soft-delete, có **trang xác nhận riêng** (GET chỉ hiển thị).

**Upload ảnh**: chọn file → multer memory → `validateImage` (JPEG/PNG/WebP, magic bytes, ≤2MB) → `storage/images/<folder>/<uuid>.<ext>` → public URL → lưu cột `image_url`; đổi/xóa ảnh thì xóa object cũ (best-effort).

**Auth**: đăng ký/đăng nhập qua Supabase Auth → cookie session → `loadUser` verify JWT + lazy-tạo `profiles` (mặc định CUSTOMER) → guard `requirePermission` theo bảng quyền. Chỉ ADMIN có `admin:access` (STAFF cũng không vào `/admin`).

## 6. Data model

```
chefs 1───* dishes *───* ingredients   (qua dish_ingredients: quantity, unit)
profiles (id = auth.users.id; role ADMIN/STAFF/CUSTOMER)
```

- `chefs`: tên, avatar, chuyên môn, tiểu sử, năm KN, SĐT, `is_active` + soft-delete
- `dishes`: tên, **slug duy nhất** (SEO tiếng Việt, chống trùng `-2`), giá, category (enum PG), ảnh, bếp (nullable, xóa bếp → set null)
- `ingredients`: tên duy nhất, đơn vị, tồn kho, giá vốn, ảnh
- Ràng buộc CHECK (giá ≥ 0, số lượng > 0, KN ≥ 0) + RLS public chỉ đọc.

## 7. Mọi quyết định — kiến trúc & backend

| # | Quyết định | Phương án loại | Lý do |
|---|---|---|---|
| 1 | SSR (Express + Handlebars) | SPA React/Vue | SEO, chạy không cần JS, đúng yêu cầu môn học |
| 2 | TypeScript strict + ESM | JS thuần | Bắt lỗi sớm, typecheck 0 lỗi duy trì |
| 3 | Supabase + Prisma 7 | SQL thô / ORM khác | Auth + Storage + Postgres một nơi; migration có version |
| 4 | URL món bằng **slug** | `/dishes/1` số | SEO + đẹp; đã đối chiếu slide tuần 3 (`docs/YC.html`): giữ nguyên tính chất path-param |
| 5 | ID nội bộ UUID, ID bậy → 404 | Để Prisma ném 500 | Lỗi đẹp thay vì sập trang (`paramId`) |
| 6 | 1 bucket `images` + thư mục | 3 bucket rời | Seed tự tạo được, code gọn |
| 7 | Chỉ ADMIN vào `/admin` | STAFF quản trị nội dung | Giảm bề mặt rủi ro |
| 8 | Soft-delete + khôi phục + trang xác nhận | Xóa cứng / xóa ngay ở list | An toàn; GET không bao giờ xóa (đúng bài tuần 3) |
| 9 | Sửa/xóa qua PATCH/DELETE + 303 | POST chung chung | Đúng ngữ nghĩa HTTP, reload an toàn |
| 10 | Profile lazy-create, mặc định CUSTOMER | Gán role tay | Đăng ký xong dùng ngay |
| 11 | Validation 3 lớp (client → Zod 422 → CHECK/PK/FK) | Chỉ 1 lớp | Mỗi lớp chặn một kiểu lỗi (case trùng nguyên liệu) |
| 12 | Ảnh thật Openverse/Flickr + Unsplash | Ảnh mock | License mở, không API key |
| 13 | Rate-limit tự viết cho login/register | Không giới hạn / thêm lib | Chống brute-force, 0 dependency |
| 14 | Key Supabase tên mới + fallback tên cũ | Một tên duy nhất | Tương thích dashboard mới và code cũ |
| 15 | Feature-branch + PR vào main | Push thẳng main | Review được, lịch sử sạch |

## 8. Mọi quyết định — UI/UX & vận hành

| # | Quyết định | Phương án loại | Lý do |
|---|---|---|---|
| 16 | Không AJAX, form GET/POST thuần | Fetch client | Đơn giản, CSRF dễ, đúng SSR |
| 17 | Tailwind (form) + CSS viết tay (site) | Một hệ duy nhất | Form nhanh, site theo design riêng |
| 18 | Dark/light bằng CSS checkbox + localStorage | Toggle JS framework | Không JS, persist được, có View Transitions |
| 19 | Font 100% tiếng Việt (Playfair + Be Vietnam Pro + IBM Plex Mono) | Font mặc định | Đã verify subset `vietnamese` qua Google Fonts API |
| 20 | Bỏ mọi zoom ảnh hover; skeleton thuần CSS | Zoom + spinner JS | Mượt, nhẹ, không layout-shift |
| 21 | Modal chi tiết bếp (`<dialog>`) + avatar fallback FB-style | Trang bếp riêng / ảnh mặc định chung | Xem nhanh không rời trang; đồng nhất khi thiếu ảnh |
| 22 | Form Việt hóa, lỗi từng field, giữ dữ liệu khi 422 | Tiếng Anh / mất dữ liệu | Đúng người dùng + ít bực mình |
| 23 | Search/filter/sort phía server qua query | Lọc client | SEO + share URL kết quả được |

## 9. Hành trình UI/UX (từ nhật ký prompt của Đức)

Mockup HTML/CSS → port thành view SSR nối backend thật → hero tách đôi + ticker → dark/light theme → animation hover tự nhiên → sửa knob + crescent moon → bỏ zoom ảnh → fix skeleton (thiếu markup + `position:relative`) → fix mojibake encoding → font Việt → responsive → search/filter/sort. Mỗi ý tưởng một prompt, chỉnh dần, kiểm chứng live sau mỗi bước.

## 10. AI usage — 3 thành viên

- **Khang** ([`AI_USAGE_KHANG.md`](AI_USAGE_KHANG.md), Antigravity): pair-programming kiến trúc — phỏng vấn 38 quyết định, sinh backend lõi, audit và vá RLS (bỏ write công cộng), chuẩn migration, debug `deleted_at` drift.
- **Đức** ([`AI_PROMPT_REPORT.md`](AI_PROMPT_REPORT.md)): nhật ký 17 prompt UI/UX — ranh giới "chỉ chạm views + CSS", báo lỗi bằng cách dán lỗi gốc, AI được chạy lệnh kiểm chứng, sinh viên quyết định cuối (giữ Be Vietnam Pro, bỏ zoom).
- **Hưng** ([`AI_USAGE_HUNG.md`](AI_USAGE_HUNG.md), OpenCode + Muse Spark): vận hành + gia cố — DB qua MCP (phát hiện comment sai 33→32), ảnh 12/12 + fix gỏi cuốn, fix boot, modal/avatar, audit validation A–H; nguyên tắc "chỉ báo cáo điều đã chạy".

## 11. Kiểm chứng (số liệu chạy thật ngày 13/10/2026)

```bash
npm run test       # 8 files, 32/32 passed
npm run typecheck  # 0 lỗi
```

- Render template với dữ liệu mẫu: modal/avatar, form món/bếp/nguyên-liệu/register đều pass.
- Boot `dev:server`: `/`, `/menu`, `/login`, `/register`, `/dishes/pho-bo-dac-biet` đều HTTP 200; CSS mới serve đủ; không rò SĐT.
- ID bậy/slug lạ → 404 đúng; `/dishes/2` → 404 đúng thiết kế (dùng slug).

## 12. Hướng dẫn demo (5 phút)

1. `/` — hero, món nổi bật, ticker, bật/tắt theme.
2. `/menu?q=pho` — tìm kiếm, lọc danh mục, sắp xếp giá/tên.
3. `/dishes/pho-bo-dac-biet` — nhấn tên/avatar bếp → modal (đóng bằng ×/nền/Esc).
4. Đăng nhập ADMIN → `/admin` — dashboard, CRUD món (thử trùng nguyên liệu → 422), quản lý bếp/kho/users, trang xác nhận xóa.
5. `/dishes/abc` → trang 404.

## 13. Việc chưa xong & bài học

- Chưa test tay: submit admin (chờ tài khoản ổn định), trùng hoa/thường tay, rate-limit tay, upload >5MB tay.
- Bài học: validate 3 lớp; migration phải đi qua Prisma; GET không bao giờ thay đổi dữ liệu (303 + trang xác nhận); kết luận file phải từ đọc trực tiếp (output tool có thể lỗi encoding); số liệu báo cáo chỉ từ lệnh đã chạy.
