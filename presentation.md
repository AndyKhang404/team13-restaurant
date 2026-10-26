# Team13 Restaurant — Frontend Presentation

> SPA React + Vite + TypeScript, gọi REST API Express.
> Tài liệu này có thể dùng để thuyết trình hoặc render thành slide bằng Marp (các `---` là ranh giới slide).

---

## Slide 1 — Mục tiêu của frontend

- Xây dựng **SPA** cho nhà hàng: xem thực đơn, xem chi tiết món, đăng nhập.
- Cung cấp **khu quản trị** cho món ăn, đầu bếp và nguyên liệu.
- Tách biệt hoàn toàn với backend:
  - Frontend chỉ chạy trong browser, không giữ secret.
  - Backend là REST API độc lập, có CORS, cookie session và RBAC.
- Ưu tiên trải nghiệm:
  - Tải nhanh, có skeleton/loading rõ ràng.
  - Lỗi nghiệp vụ và lỗi kỹ thuật được hiển thị khác nhau.
  - Responsive, hỗ trợ sáng/tối.

---

## Slide 2 — Tech stack

| Thành phần    | Lựa chọn                                     | Vai trò                         |
| ------------- | -------------------------------------------- | ------------------------------- |
| UI            | React 19                                     | Component, state cục bộ         |
| Routing       | React Router 7                               | Client-side routing             |
| Build/dev     | Vite 8                                       | Dev server, HMR, build          |
| Ngôn ngữ      | TypeScript 7 (`strict`)                      | An toàn kiểu dữ liệu            |
| Styling       | CSS thuần + CSS variables; Tailwind 4 plugin | Design tokens, responsive       |
| State         | React hooks + Context                        | Không dùng thư viện state ngoài |
| UI kit / icon | Không dùng                                   | Tự viết component, glyph text   |

- Không SSR, không Next.js: toàn bộ render diễn ra trong browser.
- `main.tsx` bọc `BrowserRouter` + `AuthProvider` + `StrictMode`.

---

## Slide 3 — Kiến trúc thư mục

```text
web/src/
├─ main.tsx            # Entry: StrictMode, BrowserRouter, AuthProvider
├─ App.tsx             # Khai báo toàn bộ route
├─ auth/
│  ├─ AuthProvider.tsx # Cookie session, user, refresh, signOut
│  └─ RequireAuth.tsx  # Chặn /admin khi chưa đăng nhập hoặc không đủ quyền
├─ components/         # Layout, AdminLayout, DishCard, StateViews, ...
├─ lib/
│  ├─ api.ts           # fetch, envelope, ApiError/HttpError, CSRF
│  ├─ resources.ts     # API client theo resource + normalize dữ liệu
│  ├─ useApi.ts        # Hook tải dữ liệu cục bộ cho từng trang
│  ├─ types.ts         # Kiểu dữ liệu dùng chung
│  └─ format.ts        # formatVnd, formatDateTime
├─ pages/              # Public pages + admin pages
└─ styles/
   ├─ public.css       # Giao diện site khách
   └─ admin.css        # Giao diện quản trị
```

**Nguyên tắc:** page sở hữu dữ liệu của page; không có global store cho list/record.

---

## Slide 4 — Sơ đồ route

### Public

| Route            | Trang                                     |
| ---------------- | ----------------------------------------- |
| `/`              | Trang chủ                                 |
| `/dishes`        | Thực đơn                                  |
| `/dishes/:slug`  | Chi tiết món                              |
| `/login`         | Đăng nhập                                 |
| `/register`      | Đăng ký                                   |
| `/auth/callback` | Nhận callback xác nhận email / magic link |
| `*`              | Trang không tìm thấy (SPA)                |

### Admin (yêu cầu đăng nhập)

| Route                      | Trang                                    |
| -------------------------- | ---------------------------------------- |
| `/admin`                   | Redirect → `/admin/dishes`               |
| `/admin/dishes`            | Danh sách món                            |
| `/admin/dishes/new`        | Thêm món                                 |
| `/admin/dishes/:id/edit`   | Sửa món                                  |
| `/admin/dishes/:id/delete` | Xóa món                                  |
| `/admin/chefs/...`         | Danh sách / thêm / sửa / xóa đầu bếp     |
| `/admin/ingredients/...`   | Danh sách / thêm / sửa / xóa nguyên liệu |

Lưu ý: `/admin/dishes/:id` **không phải** route hợp lệ; URL này rơi vào `*` và hiện lỗi SPA, không gọi API.

---

## Slide 5 — Luồng dữ liệu

```text
Page component
   │  useApi(() => resourceApi.list(...), [deps])
   ▼
lib/resources.ts
   │  gọi apiFetch, normalize price/ingredients/chef
   ▼
lib/api.ts
   │  fetch(API_BASE + path), credentials: include, cache: no-store
   │  gắn CSRF token cho POST/PATCH/DELETE
   ▼
REST API Express  →  Prisma  →  PostgreSQL / Supabase
   │
   ▼
Envelope { ok, data } hoặc { ok: false, error }
   │
   ▼
useApi: data / error / loading / reload
   │
   ▼
Page render: Loading | ErrorState | NotFoundState | nội dung
```

- `useApi` chỉ tải dữ liệu khi mount, khi `deps` đổi hoặc khi gọi `reload()`.
- Dev + `StrictMode` khiến effect chạy 2 lần → có thể thấy 2 request giống nhau trong Network. Đây là hành vi bình thường của React ở môi trường dev.

---

## Slide 6 — Lớp API và hợp đồng response

### Cấu hình

- API base lấy từ `VITE_SERVER_URL` (bắt buộc), ví dụ `http://localhost:3000`.
- `API_BASE = ${SERVER_URL}/api`.
- Không còn Vite proxy `/api`; frontend gọi thẳng API qua CORS.

### Hai loại lỗi

| Loại          | HTTP    | Body                                               | Frontend        |
| ------------- | ------- | -------------------------------------------------- | --------------- |
| Thành công    | 200     | `{ ok: true, data }`                               | Trả `data`      |
| Lỗi nghiệp vụ | **200** | `{ ok: false, error: { code, message, fields? } }` | Ném `ApiError`  |
| Lỗi kỹ thuật  | 4xx/5xx | Không theo envelope                                | Ném `HttpError` |

- Lỗi nghiệp vụ **không tô đỏ** trong DevTools vì status là 200; phải xem tab Response.
- `fields` được map xuống từng ô form qua `FieldError`.
- `NOT_FOUND` → `NotFoundState`; lỗi kỹ thuật → `ErrorState` + nút "Thử lại".
- GET được retry tối đa 5 lần khi gặp 502/503/504 hoặc lỗi mạng (hữu ích khi API đang restart).
- Nếu gặp `CSRF_INVALID`, client tải lại session và thử lại request một lần.

---

## Slide 7 — Trang chủ

- Hero giới thiệu nhà hàng, CTA "Xem thực đơn", hotline đặt bàn.
- Hiển thị món nổi bật đầu tiên làm ảnh hero.
- **Carousel món nổi bật**:
  - Ảnh trước/sau dạng "peek".
  - Nút điều hướng, chấm chọn, bộ đếm `01 / 05`.
  - Hỗ trợ swipe trên mobile.
  - Chuyển slide có animation và `inert` cho slide bị ẩn.
- Dải ticker thông tin nhà hàng.
- Khối "Vì sao chọn chúng tôi".
- CTA thay đổi theo trạng thái đăng nhập: Đăng nhập / Quản trị.
- Có skeleton riêng cho carousel khi đang tải.

---

## Slide 8 — Thực đơn và chi tiết món

### `/dishes`

- Tải toàn bộ món đang hiển thị từ `/api/menu`.
- Tìm kiếm theo tên, lọc theo danh mục, sắp xếp theo tên/giá/ngày cập nhật.
- Bộ lọc lưu trên URL (`?q=...&category=...&sort=...`) → chia sẻ hoặc reload vẫn giữ trạng thái.
- Lọc/sắp xếp diễn ra **client-side** vì danh sách món công khai không phân trang.
- Có skeleton grid, empty state và nút xóa bộ lọc.

### `/dishes/:slug`

- Breadcrumb: Thực đơn / Danh mục / Tên món.
- Ảnh, giá, danh mục, trạng thái bán, thời gian chế biến, mô tả.
- Danh sách nguyên liệu kèm định lượng.
- Thẻ đầu bếp phụ trách mở dialog chi tiết.
- Slug không tồn tại → API trả `200 { ok:false, NOT_FOUND }` → trang "Không tìm thấy món".

---

## Slide 9 — Đăng nhập và phiên làm việc

- Frontend **không lưu token trong localStorage**; phiên nằm trong cookie do API set.
- `AuthProvider` gọi `/api/auth/me` khi app khởi động để lấy user + CSRF token.
- Đăng nhập:
  1. `POST /api/auth/login`
  2. `refresh()` lại session
  3. ADMIN/STAFF: về trang trước đó hoặc `/admin/dishes`; CUSTOMER: về `/`.
- Hiển thị lỗi theo `code`:
  - `INVALID_CREDENTIALS` → "Email hoặc mật khẩu không đúng."
  - `EMAIL_NOT_CONFIRMED` → nhắc xác nhận email.
- Đăng ký:
  - Có thể yêu cầu xác nhận email → hiện màn hình "kiểm tra hộp thư".
  - Callback `/auth/callback` chuyển `code` / `token_hash` cho API đổi thành cookie session.
- `RequireAuth` kiểm tra **đã đăng nhập** và **role ADMIN/STAFF** trước khi render khung admin; CUSTOMER nhận trang 403 thay vì vào được giao diện quản trị.
- Phân quyền thật vẫn do API đảm nhiệm (RBAC); guard ở client chỉ để điều hướng và cải thiện UX.
- Nút đăng xuất bị disable trong lúc đang gọi API để tránh click lặp.

---

## Slide 10 — Khu quản trị

### Layout

- Sidebar điều hướng Món ăn / Đầu bếp / Nguyên liệu.
- Header hiển thị tên người dùng, email, nút đăng xuất.
- Mobile: menu đóng/mở, đóng khi click ra ngoài hoặc nhấn Escape.

### Danh sách

- Tải dữ liệu qua `fetchAllPages()`: đọc `pagination.totalPages` rồi gom đủ các trang.
- Tìm kiếm và lọc client-side.
- Hiển thị **10 bản ghi/trang** bằng `PanelPager` (Trước / Sau).
- Có skeleton, empty state, nút Sửa/Xóa cho từng dòng.

### Form thêm/sửa

- Validate phía client để phản hồi nhanh; API vẫn validate và trả `VALIDATION_FAILED`.
- Lỗi từng trường hiển thị ngay dưới input.
- Upload ảnh:
  - Món ăn / nguyên liệu: `image`.
  - Đầu bếp: `avatar`.
  - Preview ảnh mới, có thể xóa ảnh hiện tại.
- Món ăn có phần ghép nguyên liệu theo công thức: thêm/xóa dòng, chọn nguyên liệu, số lượng, đơn vị.
- Nút submit disable + đổi chữ "Đang lưu…" khi đang gửi.

### Xóa

- Trang xác nhận riêng trước khi xóa.
- Xóa mềm (`deletedAt`); API có endpoint `POST /:id/restore` để khôi phục.
- Hiển thị thông tin bản ghi trước khi xóa.
- Nút "Xác nhận xóa" disable + "Đang xóa…" khi đang xử lý.

---

## Slide 11 — Thiết kế giao diện

### Ngôn ngữ thị giác

- Tông giấy ấm, mực đậm, điểm nhấn đỏ gỉ.
- Bộ font:
  - `Playfair Display` cho tiêu đề.
  - `Be Vietnam Pro` cho nội dung.
  - `IBM Plex Mono` cho nhãn, metadata, nút.
- Lưới hairline, đường kẻ mảnh, bố cục editorial.
- Chuyển động nhẹ với easing thống nhất; tôn trọng thao tác người dùng.

### Design tokens

```css
--paper, --surface, --ink, --ink-2, --line,
--accent, --green, --ok, --danger, --warn,
--serif, --sans, --mono, --ease
```

- Dark mode đổi token trong `.page` / `.shell`, không nhân đôi component.
- Lưu lựa chọn vào `localStorage`.
- Dùng View Transitions API nếu trình duyệt hỗ trợ.

### Responsive

- Public: breakpoint 1200 / 980 / 820 / 640 / 380.
- Admin: breakpoint 960 / 640.
- Mobile:
  - Menu hamburger.
  - Pager admin căn giữa, bỏ padding/border kế thừa.
  - Form và bảng chuyển bố cục phù hợp.

### Accessibility

- Label cho input, `focus-visible` rõ ràng.
- `aria-live` cho bộ đếm carousel.
- `aria-busy` cho nút đang xử lý.
- Dialog dùng `<dialog>` + `aria-labelledby`, đóng bằng nút hoặc click backdrop.
- Ảnh có `alt`; ảnh danh sách dùng `loading="lazy"`.

---

## Slide 12 — Trạng thái tải và chống spam

- Mỗi trang có đủ 4 trạng thái: loading / error / empty / nội dung.
- Skeleton riêng cho:
  - Carousel trang chủ.
  - Grid thực đơn.
  - Bảng quản trị.
- Nút có gọi API đều bị disable khi request đang chạy:
  - Đăng nhập, đăng ký.
  - Lưu form, xóa bản ghi.
  - Đăng xuất.
  - "Thử lại" khi tải lỗi.
- Guard `if (busy) return` bổ sung cho trường hợp double-click/Enter.
- CSS disabled: giảm opacity, `cursor: not-allowed`, tắt hover transform/shadow.

---

## Slide 13 — Chất lượng và build

### Kiểm tra hiện có

```bash
npm run typecheck     # tsc cho server + web
npm run lint          # ESLint toàn repo
npm run build:client  # tsc + vite build
```

- TypeScript bật `strict` và `noUncheckedIndexedAccess`.
- Test tự động hiện có tập trung ở backend/error contract (Vitest); frontend chưa có test UI riêng.
- Build hiện tại: một bundle JS ~338 kB (~98 kB gzip), CSS ~80 kB (~15 kB gzip).

### Dev

```bash
npm run dev
# API  : http://localhost:3000
# SPA  : http://localhost:5173
```

- `web/.env` cần `VITE_SERVER_URL=http://localhost:3000`.
- Đổi `.env` hoặc `vite.config.ts` phải restart Vite.

### Production

- `vite build` xuất vào `dist/client`.
- Express phục vụ file tĩnh và fallback `index.html` cho route SPA.
- API và SPA có thể chạy cùng origin hoặc khác origin (CORS đọc từ cấu hình).

---

## Slide 14 — Kịch bản demo

1. **Trang chủ**
   - Carousel món nổi bật, chuyển slide bằng nút và swipe.
   - Bật/tắt dark mode, reload để thấy lựa chọn được lưu.
2. **Thực đơn**
   - Tìm "phở", lọc danh mục, đổi kiểu sắp xếp.
   - Copy URL và mở tab mới để thấy bộ lọc được giữ.
3. **Chi tiết món**
   - Mở một món hợp lệ, xem nguyên liệu và dialog đầu bếp.
   - Đổi slug sai → trang "Không tìm thấy món".
4. **Đăng nhập**
   - Đăng nhập tài khoản admin.
   - Thử sai mật khẩu để thấy lỗi nghiệp vụ hiển thị trong form.
5. **Quản trị**
   - Tìm/lọc/sang trang danh sách món.
   - Thêm món có ảnh và nguyên liệu.
   - Sửa món, xóa mềm ở trang xác nhận; minh họa khôi phục nếu cần.
   - Làm tương tự với đầu bếp và nguyên liệu.
6. **Responsive**
   - Thu nhỏ cửa sổ: menu mobile, grid chuyển cột, pager căn giữa.
7. **Network/DevTools**
   - Request API lỗi nghiệp vụ: status 200, `ok:false`, xem ở tab Response.
   - Request sai URL API: 404 thật.
   - URL SPA không khớp route: Document 200 + `index.html`, không có request API.

---

## Slide 15 — Hạn chế và hướng phát triển

### Hạn chế hiện tại

- Không có global cache/state: mỗi lần vào trang là gọi lại API.
- Admin tải toàn bộ dữ liệu rồi phân trang client-side; dữ liệu lớn sẽ tốn băng thông.
- Public menu cũng tải toàn bộ món; chưa phân trang server-side.
- Chưa có test UI/component và E2E.
- Bundle chưa code-split theo route.
- Chưa có `prefers-reduced-motion` cho người dùng nhạy cảm chuyển động.
- Chưa có trang quản lý tài khoản riêng cho CUSTOMER.

### Hướng phát triển

- Thêm phân trang server-side cho public menu và admin.
- Tách chunk theo route, lazy-load trang quản trị.
- Thêm test component + E2E cho luồng đăng nhập và CRUD.
- Bổ sung error boundary và logging lỗi nghiệp vụ ở môi trường dev.
- Tối ưu ảnh (responsive image, CDN) và thêm reduced-motion.

---

## Phụ lục A — API frontend đang dùng

| Method                    | Endpoint                  | Dùng ở                      |
| ------------------------- | ------------------------- | --------------------------- |
| GET                       | `/api/`                   | Món nổi bật trang chủ       |
| GET                       | `/api/menu`               | Danh sách món công khai     |
| GET                       | `/api/dishes/:idOrSlug`   | Chi tiết món                |
| GET                       | `/api/auth/me`            | Session + CSRF token        |
| POST                      | `/api/auth/login`         | Đăng nhập                   |
| POST                      | `/api/auth/register`      | Đăng ký                     |
| POST                      | `/api/auth/logout`        | Đăng xuất                   |
| GET                       | `/api/auth/callback`      | Xác nhận email / magic link |
| GET                       | `/api/dishes`             | Danh sách món (admin)       |
| GET                       | `/api/dishes/:idOrSlug`   | Chi tiết món (admin)        |
| POST                      | `/api/dishes`             | Thêm món                    |
| PATCH/PUT                 | `/api/dishes/:id`         | Sửa món                     |
| DELETE                    | `/api/dishes/:id`         | Xóa mềm                     |
| POST                      | `/api/dishes/:id/restore` | Khôi phục món đã xóa mềm    |
| GET/POST/PATCH/PUT/DELETE | `/api/chefs...`           | CRUD đầu bếp                |
| GET/POST/PATCH/PUT/DELETE | `/api/ingredients...`     | CRUD nguyên liệu            |
| GET                       | `/api/stats`              | Dashboard                   |
| PATCH/POST                | `/api/users/:id/role`     | Đổi vai trò người dùng      |

Backward-compatibility: các route `/api/admin/*` vẫn được hỗ trợ như alias của `/api/*`.

---
