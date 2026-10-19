# Team13 Restaurant — Tài liệu thuyết trình

- **Môn học**: Phát triển ứng dụng Web (CSC13008) — HCMUS
- **Nhóm 13**: Phùng Bảo Khang · Nguyễn Minh Đức · Hy Huê Hưng
- **Kiến trúc hiện tại**: SPA React CSR gọi REST API Express

> Tài liệu slide chi tiết: [`presentation.md`](../presentation.md).  
> Hướng dẫn cài đặt, route và API đầy đủ: [`README.md`](../README.md).  
> Tài liệu này thay thế bản mô tả SSR Handlebars trước đây.

---

## 1. Tổng quan

| Thành phần     | Công nghệ                        | Vai trò                              |
| -------------- | -------------------------------- | ------------------------------------ |
| Frontend       | React 19 + Vite + React Router 7 | SPA chạy trong browser, gọi REST API |
| Backend        | Express 5 + TypeScript (ESM)     | REST API, xác thực, upload ảnh       |
| Database / ORM | PostgreSQL (Supabase) + Prisma 7 | Lưu trữ dữ liệu                      |
| Auth / Storage | Supabase Auth + Storage          | Cookie session, bucket `images`      |

- Dev: API `http://localhost:3000`, SPA `http://localhost:5173`; frontend gọi thẳng API qua CORS, không dùng Vite proxy.
- Production: `vite build` xuất `dist/client`; Express vừa phục vụ REST API vừa fallback `index.html` cho route SPA.
- Frontend không giữ secret; chỉ dùng `VITE_SERVER_URL`.

---

## 2. Route SPA

### Public

| Route                 | Trang                                          |
| --------------------- | ---------------------------------------------- |
| `/`                   | Trang chủ                                      |
| `/dishes`             | Thực đơn (tìm kiếm, lọc, sắp xếp lưu trên URL) |
| `/dishes/:slug`       | Chi tiết món ăn                                |
| `/login`, `/register` | Đăng nhập / đăng ký                            |
| `/auth/callback`      | Callback xác nhận email / magic link           |
| `*`                   | Trang 404 phía SPA                             |

### Admin

| Route                    | Trang                                 |
| ------------------------ | ------------------------------------- |
| `/admin`                 | Redirect → `/admin/dishes`            |
| `/admin/dishes/...`      | Danh sách, thêm, sửa, xóa món         |
| `/admin/chefs/...`       | Danh sách, thêm, sửa, xóa đầu bếp     |
| `/admin/ingredients/...` | Danh sách, thêm, sửa, xóa nguyên liệu |

Guard `RequireAuth` cho phép `ADMIN` và `STAFF`; `CUSTOMER` nhận trang 403. RBAC thực thi thật ở API.

---

## 3. Hợp đồng API

- **Thành công (`2xx`)**: `{ "ok": true, "data": { ... } }`.
- **Lỗi nghiệp vụ (`HTTP 200`)**: `{ "ok": false, "error": { code, message, fields? } }` cho `VALIDATION_FAILED`, `NOT_FOUND`, `ALREADY_EXISTS`.
- **Lỗi kỹ thuật/bảo mật (`4xx` / `5xx`)**: dùng status thật, phần lớn không có `ok`. Auth, rate limit và CSRF là ngoại lệ out-of-contract; auth validation dùng `422` kèm `{ ok:false }`.
- GET được retry tối đa 5 lần khi gặp `502/503/504` hoặc lỗi mạng; `CSRF_INVALID` được refresh session rồi gửi lại một lần.
- `cache: 'no-store'` cho mọi request API; server tắt ETag để tránh `304` che mất envelope lỗi nghiệp vụ.

---

## 4. API chính

| Route                                                       | Method                  | Access                                 |
| ----------------------------------------------------------- | ----------------------- | -------------------------------------- |
| `/api/home`                                                 | GET                     | Public                                 |
| `/api/menu`                                                 | GET                     | Public; hỗ trợ `q`, `category`, `sort` |
| `/api/dishes/:idOrSlug`                                     | GET                     | Public                                 |
| `/api/auth/me`                                              | GET                     | Public                                 |
| `/api/auth/login`, `/api/auth/register`, `/api/auth/logout` | POST                    | Public / Authenticated                 |
| `/api/auth/callback`                                        | GET/POST                | Public                                 |
| `/api/stats`                                                | GET                     | Staff / Admin                          |
| `/api/dishes`                                               | GET, POST               | Staff / Admin                          |
| `/api/dishes/:id`                                           | GET, PATCH, PUT, DELETE | Staff / Admin                          |
| `/api/dishes/:id/restore`                                   | POST                    | Staff / Admin                          |
| `/api/dishes/form-deps`                                     | GET                     | Staff / Admin                          |
| `/api/chefs`, `/api/chefs/:id`                              | CRUD (`PATCH`/`PUT`)    | Staff / Admin                          |
| `/api/ingredients`, `/api/ingredients/:id`                  | CRUD (`PATCH`/`PUT`)    | Staff / Admin                          |
| `/api/users`                                                | GET                     | Admin                                  |
| `/api/users/:id/role`                                       | PATCH, POST             | Admin                                  |

Các route `/api/admin/*` vẫn được giữ như alias tương thích ngược.

---

## 5. Xóa dữ liệu

- Thao tác xóa hiện tại của món ăn, đầu bếp và nguyên liệu là **xóa mềm** (`deletedAt`) sau trang xác nhận riêng.
- API cung cấp `POST /api/dishes/:id/restore` (và các route restore tương tự cho đầu bếp/nguyên liệu) để khôi phục bản ghi.
- Danh sách công khai chỉ hiển thị bản ghi chưa bị xóa mềm; Staff/Admin có thể xem cả bản ghi đã xóa mềm ở một số endpoint quản trị.

---

## 6. RBAC

| Quyền                              | ADMIN | STAFF | CUSTOMER | Guest |
| ---------------------------------- | :---: | :---: | :------: | :---: |
| Xem thực đơn, chi tiết món         |  ✅   |  ✅   |    ✅    |  ✅   |
| Vào `/admin`                       |  ✅   |  ✅   |    ❌    |  ❌   |
| CRUD món ăn, đầu bếp, nguyên liệu  |  ✅   |  ✅   |    ❌    |  ❌   |
| Quản lý người dùng (`user:manage`) |  ✅   |  ❌   |    ❌    |  ❌   |

---

## 7. Kiểm thử & chất lượng

```bash
npm test          # Vitest: backend/error contract/CORS/RBAC/validation
npm run typecheck # tsc cho server + web
npm run lint      # ESLint toàn repo
npm run build     # Vite SPA + TypeScript server
```

- Test backend tập trung vào hợp đồng lỗi, CORS, phân quyền, validation, slug, rate limit và UUID sai.
- Frontend chưa có test UI/E2E riêng; xem mục "Hướng phát triển" trong [`presentation.md`](../presentation.md).

---

## 8. Tài liệu lịch sử

- `docs/presentation.html`: deck SSR Handlebars cũ, không còn phản ánh code CSR hiện tại.
- `reports/backend-testing/*`: báo cáo kiểm thử lịch sử; số liệu có thể khác code hiện tại nhưng vẫn mô tả đúng soft-delete/restore.
- `docs/presentation.html` và `reports/backend-testing/*` là tài liệu lịch sử, giữ nguyên để minh bạch quá trình làm việc.
- `docs/AI_USAGE_*.md`, `docs/AI_PROMPT_REPORT.md`: nhật ký quá trình làm việc, giữ nguyên để minh bạch lịch sử.
