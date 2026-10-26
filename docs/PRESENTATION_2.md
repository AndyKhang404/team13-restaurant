# Team13 Restaurant — Thuyết trình kỹ thuật (Phiên bản 2)

> Nội dung tập trung vào **kỹ thuật của hệ thống hiện tại** (React CSR + Express 5 REST API + Prisma + Supabase). Mọi chi tiết đều lấy từ mã nguồn trong repo. Slide tương ứng: [`presentation_2.html`](./presentation_2.html) (~15 slide, ~15 phút).

---

## Slide 1 — Tiêu đề

**Team13 Restaurant — Kiến trúc SPA + REST API**
React 19 · Vite · Express 5 · Prisma 7 · Supabase (Postgres, Auth, Storage) · TypeScript.

## Slide 2 — Kiến trúc tổng thể

- **Client**: SPA render phía client (Vite + React Router v7 + Tailwind v4), build ra `dist/client`.
- **Server**: Express 5 (ESM, TypeScript) chỉ phát JSON dưới `/api/*`; ở production còn phục vụ `dist/client` và **SPA fallback** (`index.html` cho request `GET` chấp nhận HTML không thuộc `/api`).
- **Dữ liệu**: PostgreSQL trên Supabase, truy cập bằng Prisma 7 qua `@prisma/adapter-pg`.
- **Danh tính**: Supabase Auth (JWT). **Lưu ảnh**: Supabase Storage.
- Phân tầng thư mục backend: `config/` · `middleware/` · `auth/` · `lib/` · `modules/{dishes,chefs,ingredients,users,admin,public}`.

## Slide 3 — Pipeline middleware của Express

Thứ tự trong `createApp()` (có chủ đích):

1. `helmet` (CORP `cross-origin`) → `morgan` (chỉ dev)
2. **CORS** (trước CSRF để preflight `OPTIONS` được trả lời)
3. Static: `public/` và `dist/client/`
4. Body parser (`urlencoded`, `json`) → `cookieParser(CSRF_SECRET)`
5. `browserId` (cookie ký `sid`) → `multipart` (multer)
6. `csrfProtection` + `csrfToken`
7. `loadUser` (xác thực + gắn `req.user`)
8. Router: `/api/auth`, `/dishes`, `/chefs`, `/ingredients`, `/users`, `/stats`, `/admin`, `/api`
9. 404 JSON cho `/api/*` / SPA fallback → **error handler tập trung**

## Slide 4 — Mô hình dữ liệu (Prisma)

- Bảng: `Profile` (role `ADMIN|STAFF|CUSTOMER`), `Chef`, `Ingredient`, `Dish`, `DishIngredient` (N–N, khóa chính kép `[dishId, ingredientId]`, có `quantity`, `unit`).
- `DishCategory` enum: `appetizer | main | dessert | drink | combo`.
- UUID mặc định `gen_random_uuid()`, `@map` snake_case, `Decimal` cho tiền (12,2) và số lượng (10,2), `Timestamptz`.
- **Soft delete** bằng `deletedAt` ở Dish/Chef/Ingredient.
- Index: `chefId`, `category`, `isAvailable`; `Dish.slug` và `Ingredient.name` là `@unique`.
- Quan hệ: `Dish.chef` → `onDelete: SetNull`; `DishIngredient` → `Cascade`.

## Slide 5 — Migration & ràng buộc ở tầng DB

- Mọi thay đổi schema qua **migration có version** (`prisma/migrations/*`): `0_init`, `add_missing_columns`, `category_enum`, `add_checks_and_rls`.
- **CHECK constraints** viết tay trong migration: `price >= 0`, `stock_quantity >= 0`, `price_per_unit >= 0`, `experience_years >= 0`, `prep_time_minutes IS NULL OR > 0`, `dish_ingredients.quantity > 0`.
- **Row Level Security** bật cho mọi bảng:
  - Public `SELECT` chỉ với `deleted_at IS NULL` (role `anon`, `authenticated`).
  - Xóa toàn bộ policy ghi từ client → mọi mutation phải đi qua server (Prisma/service role).
  - `profiles`: chỉ đọc hồ sơ của chính mình (`auth.uid() = id`).
  - Storage: public read, upload chỉ bằng server.
- Ý tưởng: **phòng thủ nhiều lớp** — Zod (ứng dụng) + CHECK/RLS (DB).

## Slide 6 — Xác thực: Bearer JWT + cookie

- `loadUser` đọc token từ `Authorization: Bearer` (ưu tiên) hoặc cookie Supabase (`@supabase/ssr`, fallback).
- Xác minh bằng `supabase.auth.getUser(token)`; nếu lỗi thì **fallback `getClaims`** (giải mã offline).
- **Lazy Profile sync**: `profile.findUnique` → nếu chưa có thì `upsert` (role mặc định `CUSTOMER`) ngay lần đăng nhập đầu — không cần webhook/trigger.
- Request ẩn danh bỏ qua round-trip xác thực; token lỗi → `req.user = null`, không crash.
- Phía SPA: token lưu `localStorage`, `apiFetch` tự gắn `Authorization`; gặp `401` thì xóa token.

## Slide 7 — RBAC theo permission

- Code **kiểm tra permission, không kiểm tra tên role**: `can(user, 'dish:create')`.
- Union type `Permission`: `admin:access`, `dish|chef|ingredient:{create,update,delete}`, `user:manage`.
- Ánh xạ `ROLE_PERMISSIONS: Record<Role, Set<Permission>>`: ADMIN = tất cả; STAFF = nội dung + `admin:access`; CUSTOMER = ∅.
- `requirePermission(p)` → `401 UNAUTHORIZED` (chưa đăng nhập) hoặc `403 FORBIDDEN`.
- Quản lý user: chặn **tự đổi role** (`SELF_ROLE_CHANGE`) và chặn hạ cấp **admin cuối cùng** (`LAST_ADMIN`).
- Client `RequireAuth` chỉ là UX; quyền thực sự luôn do API cưỡng chế.

## Slide 8 — Bảo mật HTTP

- **CSRF double-submit** (`csrf-csrf`) gắn với cookie `sid` ký; token qua header `x-csrf-token` hoặc `_csrf`.
- Request mang `Bearer` được **miễn CSRF** (trình duyệt không tự đính kèm header này cross-origin); request dùng cookie vẫn bị kiểm.
- **CORS** whitelist: `APP_URL`, `SPA_ORIGIN`/`CORS_ORIGIN`, localhost chỉ khi không phải production; `credentials: true`, origin phản chiếu (không dùng `*`), expose `x-csrf-token`.
- **Rate limit** in-memory (cửa sổ trượt 60s, tối đa 20, khóa `ip:path`) cho `/auth/login`, `/auth/register` → `429 RATE_LIMITED`; có dọn map khi > 5000 key.
- `helmet`; `safeNext()` chống open redirect; `paramId()` biến UUID sai thành 404 thay vì 500.

## Slide 9 — Hợp đồng API & xử lý lỗi

- Thành công: `{ ok: true, data }`.
- **Lỗi nghiệp vụ** (validation, 404, 409): HTTP **200** + `{ ok: false, error: { code, message, fields? } }`.
- **Lỗi kỹ thuật** (401, 403, 429, CSRF, URL sai, crash): status thật, body `{ error: {...} }` **không có `ok`**.
- Mã lỗi gõ kiểu (`ApiErrorCode`): `VALIDATION_FAILED`, `ALREADY_EXISTS`, `FORBIDDEN`, `RATE_LIMITED`, `CSRF_INVALID`, `LAST_ADMIN`, …
- Một `errorHandler` duy nhất: `HttpError` (có cờ `business`) → chọn dạng phản hồi; production che message lỗi 5xx.
- Client (`apiFetch<T>`) bóc envelope, ném `ApiError` (nghiệp vụ) hoặc `HttpError` (kỹ thuật).

## Slide 10 — Validation với Zod

- Helper dùng lại: `requiredText`, `optionalText`, `optionalInt`, `decimal`, `optionalPhone` (regex SĐT VN), `checkbox`.
- `blankToUndefined`: chuỗi rỗng / `"null"` / `"undefined"` → `undefined` để trường tùy chọn đúng nghĩa (form multipart gửi toàn chuỗi).
- `z.coerce.number` cho dữ liệu form; thông báo tiếng Việt.
- `toFieldErrors(ZodError)` → `{ "name": "...", "ingredients.0.quantity": "..." }` (lấy lỗi đầu mỗi path) → trả về qua `error.fields` để UI tô đúng ô.
- Validate ảnh và dòng nguyên liệu **song song** với schema, gộp thành một lượt lỗi.

## Slide 11 — Nghiệp vụ Món ăn: slug & công thức

- `slugify`: NFD → bỏ dấu, `đ→d`, ký tự lạ → `-`, cắt 80 ký tự (`Phở Bò` → `pho-bo`).
- `nextFreeSlug(base, taken)` → `pho-bo`, `pho-bo-2`, … (tra các slug `startsWith(base)`); vẫn bắt `P2002` để trả `409` khi đua ghi.
- `GET /dishes/:idOrSlug`: tra theo UUID **hoặc** slug; món đã xóa mềm chỉ staff mới thấy.
- Cập nhật công thức: `$transaction` → `deleteMany` dòng cũ + `update` kèm `ingredients.create` (nguyên tử).
- Công khai chỉ trả **tên** nguyên liệu (ẩn tồn kho/giá vốn); staff nhận thêm `dishIngredients` đầy đủ.
- Xóa = `deletedAt = now()`; `POST /:id/restore` khôi phục.

## Slide 12 — Upload ảnh (Supabase Storage)

- multer nhận multipart (`.any()`), giới hạn **2 MB**.
- `validateImage`: whitelist MIME (JPEG/PNG/WebP) **và kiểm tra magic bytes** (không tin mimetype).
- Đường dẫn `folder/uuid.ext` (`dishes|chefs|ingredients`), `cacheControl` 1 năm, `upsert:false`.
- `saveWithImage`: upload trước → ghi DB → **rollback xóa ảnh mới nếu DB lỗi** → xóa ảnh cũ sau khi thành công. `deleteImageByUrl` best-effort, chỉ đụng URL thuộc bucket của mình.
- Cờ `removeImage` để gỡ ảnh.

## Slide 13 — Frontend: định tuyến & trạng thái

- React Router v7: `<Layout>` (public) và `/admin` bọc bởi `<RequireAuth><AdminLayout/></RequireAuth>`; CRUD `dishes|chefs|ingredients` gồm `new`, `:id/edit`, `:id/delete`, cộng `users`.
- Trạng thái **không dùng store toàn cục**: `AuthProvider` chỉ giữ `user/loading`; mỗi trang tự quản dữ liệu với hook `useApi(loader, deps)` (hủy cập nhật khi unmount bằng cờ `alive`, có `reload`).
- Lớp tài nguyên `resources.ts` (`dishesApi`, `chefsApi`, …) + `fetchAllPages` + `normalizeDish` tách UI khỏi chi tiết API; `toFormData` cho multipart.

## Slide 14 — HTTP client của SPA

- `apiFetch<T>`: JSON hoặc `FormData`, `credentials: 'include'`, gắn `Authorization: Bearer` và `x-csrf-token` (cho phương thức không an toàn).
- **CSRF tự phục hồi**: gặp `CSRF_INVALID` → `loadSession()` lấy token mới → thử lại đúng 1 lần.
- **Retry có điều kiện**: chỉ `GET/HEAD`, tối đa 5 lần, backoff 250ms×n khi mạng lỗi hoặc proxy trả 502/503/504 (sống sót lúc API khởi động lại ở dev); không bao giờ retry thao tác ghi.
- `VITE_SERVER_URL` bắt buộc (fail-fast khi thiếu).

## Slide 15 — Kiểm thử & Build

- **Vitest** (`tests/**`, 10 file): `permissions`, `bearer-auth`, `cors`, `rate-limit`, `error-contract`, `http`, `slug`, `admin-id`, `chef-validation`, `dish-ingredients`.
- QA black-box bằng `curl` trên server thật: 75 case (74 PASS, 1 BLOCKED do Supabase yêu cầu xác nhận email) — xem `reports/backend-testing/`.
- Build: `tsc` (server) + `vite build` (client → `dist/client`); `typecheck`, `eslint`, `prettier`; `prisma generate` ở `postinstall`.
- Dev: `concurrently` chạy server (`node --watch --import tsx`) và Vite (cổng 5173).

---

## Tóm tắt thông điệp chính

1. Tách rõ SPA ↔ REST API, hợp đồng lỗi nhất quán.
2. Bảo vệ nhiều lớp: Zod → RBAC → CSRF/CORS/rate-limit → CHECK/RLS.
3. Xử lý các tình huống thực tế: đua slug, rollback ảnh, giao dịch công thức, retry/CSRF tự phục hồi.
