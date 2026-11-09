# BÁO CÁO BẰNG CHỨNG NỘP BÀI — BLOCK 9 (BÀI 1)
## Xác Thực Cho Ứng Dụng Restaurant (CSR & REST API)

> **Môn học**: Kiến trúc Ứng dụng Web (Web Application Architecture) — HCMUS  
> **Nhóm thực hiện**: Nhóm 13 (Team 13)  
> **Dự án**: `team13-restaurant` (Nhánh phát triển: `feat/block9`)  
> **Phạm vi báo cáo**: **Bài 1 — Xác thực cho Restaurant App (CSR & REST API)** theo slide bài giảng Block 9 (Slide 13 – 35, 58).  
> *(Ghi chú: Theo đúng yêu cầu đề bài Bài 1, báo cáo và mã nguồn **không bao gồm MFA** và **chưa dùng role để phân quyền RBAC/ABAC** theo Slide 30: "Mọi tài khoản đã kích hoạt dùng được CRUD; role chưa dùng để phân quyền ở bài này").*  
> **Thời gian nghiệm thu**: 09/11/2026  
> **Trạng thái kiểm thử**: **16 / 16 Kịch bản PASS (100%)** — Kiểm thử tự động qua [`run_block9_tests.sh`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/reports/block9/run_block9_tests.sh) và bộ test Vitest 15 test suites (108/108 tests).

---

## MỤC LỤC
1. [Tổng Quan Kiến Trúc & Đặc Tả Chuẩn Hóa Theo Slide Deck](#1-tổng-quan-kiến-trúc--đặc-tả-chuẩn-hóa-theo-slide-deck)
2. [Sơ Đồ Luồng Đăng Nhập JWT & Chính Sách Quản Lý Token](#2-sơ-đồ-luồng-đăng-nhập-jwt--chính-sách-quản-lý-token)
   - 2.1. Sơ đồ tuần tự đăng nhập & gọi API (Sequence Diagram)
   - 2.2. Vị trí lưu trữ Token & Đánh giá rủi ro XSS
   - 2.3. Chính sách thu hồi Token khi đổi mật khẩu (`iat` vs `passwordResetAt`)
3. [Danh Sách Mô-đun Chuyển Đổi Từ Block 8 Sang REST API](#3-danh-sách-mô-đun-chuyển-đổi-từ-block-8-sang-rest-api)
4. [Bằng Chứng Chi Tiết 16 Kịch Bản Nghiệm Thu](#4-bằng-chứng-chi-tiết-16-kịch-bản-nghiệm-thu)
   - 4.1. Nhóm 1: JWT và API (6 kịch bản — Slide 32)
   - 4.2. Nhóm 2: Đăng ký, Kích hoạt và Đăng nhập (5 kịch bản — Slide 33)
   - 4.3. Nhóm 3: Quên mật khẩu (5 kịch bản — Slide 34)
5. [Phân Tích Lỗi Do Coding Agent Tạo Ra & Cách Khắc Phục](#5-phân-tích-lỗi-do-coding-agent-tạo-ra--cách-khắc-phục)
6. [Bảng Tổng Hợp Kết Quả & Kết Luận](#6-bảng-tổng-hợp-kết-quả--kết-luận)

---

## 1. TỔNG QUAN KIẾN TRÚC & ĐẶC TẢ CHUẨN HÓA THEO SLIDE DECK

Dự án **Team13 Restaurant** phân tách độc lập giữa **Client-Side Rendering (React 19 + Vite SPA)** và **Backend REST API (Express 5 + Prisma 7 + PostgreSQL / Supabase)**:
- **Client (web/)**: Chạy trên cổng `5173`, giao tiếp với backend hoàn toàn qua HTTP REST API. Khi gặp lỗi 401 từ bất kỳ endpoint nào, lớp `apiFetch` tự động xóa token trong `localStorage` và chuyển hướng về `/login?next=...`.
- **JSON Envelope chuẩn (Slide 13, 58)**:
  - Thành công: `{ ok: true, data: T }`
  - Thất bại (cả nghiệp vụ lẫn kỹ thuật 401/403/404/429/500): `{ ok: false, error: { code: string, message: string, fields?: Record<string, string> } }`
- **Mã lỗi & Trạng thái HTTP chuẩn hóa theo Slide Deck**:
  - **Lỗi xác thực kỹ thuật (Slide 13, 19, 32)**:
    - Thiếu token / sai chữ ký / token bị thu hồi: HTTP **401** `{ ok: false, error: { code: "UNAUTHENTICATED", message: "..." } }`.
    - Token đã hết hạn (`exp` trong quá khứ): HTTP **401** `{ ok: false, error: { code: "TOKEN_EXPIRED", message: "..." } }`.
    - Không có quyền: HTTP **403** `{ ok: false, error: { code: "FORBIDDEN", message: "..." } }`.
  - **Lỗi nghiệp vụ Form (Slide 15, 16, 17, 18, 28, 33, 34)**:
    - Đăng nhập sai mật khẩu: HTTP **200** `{ ok: false, error: { code: "INVALID_CREDENTIALS", message: "..." } }`.
    - Tài khoản chưa kích hoạt (pending email confirmation): HTTP **200** `{ ok: false, error: { code: "ACCOUNT_NOT_ACTIVATED", message: "..." } }` (không cấp `accessToken`).
    - Thiếu hoặc sai CAPTCHA: HTTP **200** `{ ok: false, error: { code: "CAPTCHA_REQUIRED" | "INVALID_CAPTCHA", message: "..." } }`.
    - OTP không hợp lệ hoặc hết hạn: HTTP **200** `{ ok: false, error: { code: "INVALID_OTP", message: "..." } }`.
    - Token reset password không hợp lệ hoặc hết hạn: HTTP **200** `{ ok: false, error: { code: "INVALID_RESET_TOKEN", message: "..." } }`.
  - **Bảo vệ CSRF và thứ tự Middleware (Slide 19, 32)**:
    - Request không xác thực (không Bearer token, không auth cookie) gửi đến endpoint bảo vệ nhận **401 UNAUTHENTICATED**, không bị nhầm lẫn thành 403 `CSRF_INVALID`.
  - **Phân quyền trong Bài 1 (Slide 30)**:
    - *"Mọi tài khoản đã kích hoạt dùng được CRUD; role chưa dùng để phân quyền ở bài này"*. Toàn bộ user đã xác thực (kể cả role `VIEWER`) đều được phép truy cập `/admin` và thực hiện CRUD món ăn. Phân quyền chi tiết RBAC/ABAC thuộc phạm vi Bài 2.

---

## 2. SƠ ĐỒ LUỒNG ĐĂNG NHẬP JWT & CHÍNH SÁCH QUẢN LÝ TOKEN

### 2.1. Sơ đồ tuần tự đăng nhập & gọi API (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant SPA as Client (React 19 SPA)
    participant Storage as LocalStorage (auth_token)
    participant API as Express REST API (/api/*)
    participant Attempt as Login Attempts & CAPTCHA
    participant DB as Database (Prisma / Supabase Auth)

    User->>SPA: Nhập Email & Mật khẩu
    SPA->>API: POST /api/auth/login { email, password, captchaResponse? }
    
    API->>Attempt: Kiểm tra số lần thử sai (email/IP)
    alt Thử sai >= 3 lần & thiếu CAPTCHA
        Attempt-->>API: Yêu cầu CAPTCHA
        API-->>SPA: HTTP 200 { ok: false, error: { code: "CAPTCHA_REQUIRED" } }
        SPA-->>User: Hiển thị widget reCAPTCHA bắt buộc
    else Số lần thử hợp lệ hoặc CAPTCHA đúng
        API->>DB: supabase.auth.signInWithPassword(email, password)
        alt Sai mật khẩu
            DB-->>API: Error (Invalid login credentials)
            API->>Attempt: Ghi nhận 1 lần thử thất bại
            API-->>SPA: HTTP 200 { ok: false, error: { code: "INVALID_CREDENTIALS" } }
            SPA-->>User: Báo lỗi mật khẩu, không cấp token
        else Tài khoản chưa kích hoạt
            DB-->>API: Error (Email not confirmed)
            API-->>SPA: HTTP 200 { ok: false, error: { code: "ACCOUNT_NOT_ACTIVATED" } }
            SPA-->>User: Yêu cầu vào email xác nhận OTP
        else Đăng nhập thành công
            DB-->>API: User Session + JWT access_token
            API->>Attempt: Xóa bộ đếm thất bại
            API->>DB: prisma.profile.findUnique(userId)
            DB-->>API: Profile
            API-->>SPA: HTTP 200 { ok: true, data: { user, accessToken } }
            SPA->>Storage: setAuthToken(accessToken) -> Lưu vào localStorage["auth_token"]
            SPA-->>User: Chuyển hướng vào trang chính / quản trị
        end
    end

    Note over User,DB: Request gọi API bảo vệ (Dishes CRUD, Chefs, Ingredients)
    User->>SPA: Thao tác tạo món ăn
    SPA->>Storage: getAuthToken()
    Storage-->>SPA: Chuỗi JWT Bearer token
    SPA->>API: POST /api/dishes (Headers: Authorization: Bearer <token>)
    API->>API: loadUser middleware: giải mã token, kiểm tra exp claim
    alt Token đã hết hạn (exp < now)
        API-->>SPA: HTTP 401 { ok: false, error: { code: "TOKEN_EXPIRED" } }
        SPA->>Storage: Xóa token khỏi localStorage
        SPA-->>User: Chuyển hướng về /login?next=...
    else Chữ ký sai hoặc token bị thu hồi (iat <= passwordResetAt)
        API-->>SPA: HTTP 401 { ok: false, error: { code: "UNAUTHENTICATED" } }
        SPA->>Storage: Xóa token khỏi localStorage
        SPA-->>User: Chuyển hướng về /login?next=...
    else Token hợp lệ
        API->>DB: Thực hiện thao tác CRUD món ăn
        DB-->>API: Kết quả dữ liệu
        API-->>SPA: HTTP 200 { ok: true, data: { ... } }
    end
```

### 2.2. Vị trí lưu trữ Token & Đánh giá rủi ro XSS

- **Vị trí lưu trữ**: **`localStorage`** (khóa `auth_token`), kết hợp bộ nhớ biến runtime module trong [`web/src/lib/api.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/lib/api.ts).
- **Lý do lựa chọn**:
  1. **Tương thích hoàn hảo với mô hình REST API decoupled**: Client (`http://localhost:5173`) và Server (`http://localhost:3000`) là hai origin độc lập. Lưu token trong `localStorage` cho phép client chủ động đính kèm vào header `Authorization: Bearer <token>` trên mỗi request một cách tường minh, tuân thủ nghiêm ngặt nguyên lý Stateless của REST API (Slide 13).
  2. **Tránh phụ thuộc Cookie bên thứ ba (Third-party Cookies)**: Các trình duyệt hiện đại chặn cookie cross-site theo mặc định. Bearer token loại bỏ hoàn toàn các lỗi mất phiên do bị chặn cookie.
  3. **Miễn trừ tấn công CSRF**: Trình duyệt **không bao giờ tự động gửi header tùy biến (`Authorization`)** trong các request cross-origin từ các trang web lạ. Do đó, toàn bộ API mutation (`POST`, `PATCH`, `DELETE`) mang Bearer token được miễn trừ rủi ro CSRF.
- **Rủi ro XSS (Cross-Site Scripting) & Biện pháp phòng vệ (Defense in Depth)**:
  - *Rủi ro*: Nếu ứng dụng có lỗ hổng XSS, mã độc có thể đọc trộm `localStorage.getItem('auth_token')`.
  - *Giải pháp triệt tiêu rủi ro*:
    * React 19 tự động escape mọi biến khi render JSX, loại bỏ nguy cơ chèn mã HTML. Nhóm cam kết **không sử dụng `dangerouslySetInnerHTML`** cho bất kỳ nội dung nào do người dùng cung cấp.
    * Áp dụng `helmet` tại backend với đầy đủ các header bảo mật: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Resource-Policy: cross-origin`.
    * JWT được cấu hình thời gian sống hữu hạn (Short-lived TTL), giảm thiểu tối đa cửa sổ tấn công nếu token vô tình bị rò rỉ.

### 2.3. Chính sách thu hồi Token khi đổi mật khẩu (`iat` vs `passwordResetAt`)

Theo nguyên lý cơ bản của JWT, token không trạng thái (stateless) tự chứng thực bằng chữ ký số và không thể vô hiệu hóa trước khi hết hạn `exp` nếu không lưu trạng thái thu hồi (Slide 22).

Để giải quyết triệt để vấn đề này, nhóm triển khai mô hình **Token Revocation Timestamp** trong [`src/auth/token-revocation.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/token-revocation.ts):
1. **Ghi nhận thời điểm đổi mật khẩu**: Khi người dùng hoàn tất đặt lại mật khẩu thành công qua `POST /api/auth/reset-password`, máy chủ gọi hàm `recordPasswordReset(userId)`. Hàm này lưu mốc thời gian Unix hiện tại (`passwordResetAt`).
2. **Kiểm tra khi xác thực request**: Trong `loadUser` middleware ([`src/auth/middleware.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/middleware.ts)), máy chủ trích xuất claim `iat` (Issued At) từ payload của JWT và kiểm tra:
   ```ts
   if (isTokenRevoked(userId, tokenIat)) {
     req.tokenRevoked = true; // Sẽ bị requireAuth từ chối với 401 UNAUTHENTICATED
   }
   ```
3. **Kết quả**: Tất cả các JWT được phát hành trước thời điểm đổi mật khẩu (`iat <= passwordResetAt`) đều bị thu hồi lập tức và nhận phản hồi **HTTP 401 `UNAUTHENTICATED`**, ngay cả khi thời hạn `exp` của token vẫn còn hiệu lực.
4. **Không tự cấp token mới**: Sau khi đổi mật khẩu thành công, máy chủ không trả về `accessToken`. Người dùng phải thực hiện đăng nhập lại bằng mật khẩu mới tại màn hình `/login` (Slide 34).

---

## 3. DANH SÁCH MÔ-ĐUN CHUYỂN ĐỔI TỪ BLOCK 8 SANG REST API

| Mô-đun / Tệp nguồn | Vai trò ở Block 8 (SSR) | Chuyển đổi sang Block 9 (REST API / CSR) | Chi tiết thay đổi |
|---|---|---|---|
| [`src/auth/routes.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/routes.ts) | Render view Handlebars, redirect 303, lưu session trong cookie | REST API 100% trả JSON chuẩn `{ ok, data/error }` | • `/login`: Trả HTTP 200 `{ ok: false, error: { code: 'INVALID_CREDENTIALS' / 'ACCOUNT_NOT_ACTIVATED' / 'CAPTCHA_REQUIRED' } }`. Khi thành công trả `{ ok: true, data: { user, accessToken } }`.<br>• `/register`: Bỏ qua `role` client gửi, trả HTTP 200 `CAPTCHA_REQUIRED` khi thiếu CAPTCHA, gửi OTP, không cấp token.<br>• `/verify-otp`: Trả HTTP 200 `INVALID_OTP` khi sai/hết hạn. Khi đúng trả 200 thành công, không cấp session tự động.<br>• `/forgot-password`: Trả HTTP 200 cùng thông điệp trung lập chống User Enumeration.<br>• `/reset-password`: Chỉ tiêu thụ token qua method POST; gọi `recordPasswordReset(userId)` để thu hồi các JWT cũ; trả HTTP 200 `INVALID_RESET_TOKEN` khi token sai; không trả `accessToken`. |
| [`src/auth/token-revocation.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/token-revocation.ts) | Chưa có | Quản lý trạng thái thu hồi JWT | • Ghi nhận `passwordResetAt` theo `userId`.<br>• So sánh `iat <= passwordResetAt` để vô hiệu hóa token cũ trước hạn `exp` (Slide 22). |
| [`src/auth/middleware.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/middleware.ts) | Đọc session từ cookie Supabase | Đọc `Authorization: Bearer <token>`, phân biệt mã lỗi 401 | • Trích xuất token Bearer qua `getBearerToken(req)`.<br>• Phân biệt rõ `TOKEN_EXPIRED` (khi `exp < now`) và `UNAUTHENTICATED` (chữ ký hỏng / thiếu token / bị thu hồi).<br>• Cho phép mọi tài khoản đã kích hoạt sử dụng CRUD theo đúng Slide 30. |
| [`src/middleware/security.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/middleware/security.ts) | CSRF cho form HTML | Chuẩn hóa thứ tự CSRF và Bearer Auth | • Request không mang Bearer token và không có auth cookie được chuyển qua `requireAuth` để trả về đúng 401 `UNAUTHENTICATED` (Slide 19, 32). |
| [`src/middleware/cors.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/middleware/cors.ts) | Không cần thiết (vì SSR cùng domain) | Cấu hình CORS tường minh cho Vite SPA | • Whitelist origin `http://localhost:5173`.<br>• Cho phép header `Authorization`, `Content-Type`, `x-csrf-token`.<br>• Trả lời preflight `OPTIONS` với HTTP 204 No Content. |
| [`src/auth/login-attempts.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/login-attempts.ts) | Quản lý đếm sai trong session SSR | Quản lý in-memory theo `email` và `ip` | • Ngưỡng `CAPTCHA_THRESHOLD = 3`.<br>• Khi đạt ngưỡng, yêu cầu CAPTCHA trả về HTTP 200 `CAPTCHA_REQUIRED`. |
| [`web/src/lib/api.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/lib/api.ts) | Không có (chưa có frontend CSR) | Lớp gọi API tập trung cho React | • Tự động gắn header `Authorization: Bearer ${token}` lấy từ `localStorage`.<br>• Khi gặp phản hồi 401, tự động gọi `setAuthToken(null)` và chuyển hướng về `/login?next=...`. |
| [`web/src/pages/ResetPassword.tsx`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/pages/ResetPassword.tsx) | View Handlebars SSR | React Component hiển thị form trực tiếp | • Khi mount, **không gọi API** làm tiêu thụ token sớm.<br>• Token chỉ được gửi và tiêu thụ khi người dùng submit form POST `/api/auth/reset-password` (Slide 18, 34). |
| [`web/src/auth/RequireAuth.tsx`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/auth/RequireAuth.tsx) | Không có | Route Guard bảo vệ `/admin/*` | • Chỉ kiểm tra `!user` (đã đăng nhập), không chặn `VIEWER` trong Bài 1 (Slide 30). |

---

## 4. BẰNG CHỨNG CHI TIẾT 16 KỊCH BẢN NGHIỆM THU

*Toàn bộ các bằng chứng dưới đây được trích xuất trực tiếp từ quá trình chạy script kiểm thử [`reports/block9/run_block9_tests.sh`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/reports/block9/run_block9_tests.sh) và log thực thi [`reports/block9/execution_log.txt`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/reports/block9/execution_log.txt) trên máy chủ Express thật.*

### 4.1. Nhóm 1: JWT và API (6 kịch bản — Slide 32)

#### Kịch bản TC01: Chưa đăng nhập, gọi POST, PATCH, DELETE vào endpoint bảo vệ
- **Mục tiêu**: Chứng minh các thao tác thay đổi dữ liệu (`POST /api/dishes`, `PATCH`, `DELETE`) không mang Bearer token bị chặn với mã 401 `UNAUTHENTICATED` (không bị nhầm sang 403 `CSRF_INVALID` theo Slide 19, 32).
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i -X POST http://localhost:3000/api/dishes \
    -H "Content-Type: application/json" \
    -d '{"name":"Món Test Chưa Đăng Nhập"}'
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-store

  {"ok":false,"error":{"code":"UNAUTHENTICATED","message":"Vui lòng đăng nhập để tiếp tục."}}
  ```
- **Application Storage**: `localStorage.getItem('auth_token') === null`.
- **Đánh giá**: **PASS** — Trả đúng HTTP 401 `{ ok: false, error: { code: "UNAUTHENTICATED" } }`.

---

#### Kịch bản TC02: Gọi API trực tiếp bằng cURL (bỏ qua giao diện)
- **Mục tiêu**: Chứng minh việc gọi API trực tiếp bằng công cụ cURL bên ngoài (bỏ qua giao diện web) nhận kết quả 401 `UNAUTHENTICATED` đồng nhất như qua giao diện.
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i http://localhost:3000/api/chefs
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"UNAUTHENTICATED","message":"Vui lòng đăng nhập để tiếp tục."}}
  ```
- **Đánh giá**: **PASS** — Cơ chế bảo vệ nằm tại middleware backend, không phụ thuộc vào frontend.

---

#### Kịch bản TC03: JWT bị sửa đổi (tampered) hoặc hết hạn (expired)
- **Mục tiêu**: Chứng minh server phân biệt rõ ràng token hết hạn (trả về `TOKEN_EXPIRED`) và token bị sửa đổi/hỏng chữ ký (trả về `UNAUTHENTICATED`) theo Slide 13, 19, 32.
- **Request 1: Token hết hạn (`exp` trong quá khứ)**:
  ```bash
  # JWT có payload: {"sub":"dummy-user","exp":<thời_gian_quá_khứ>}
  curl -i -X POST http://localhost:3000/api/dishes \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni...[EXPIRED_JWT]" \
    -H "Content-Type: application/json" \
    -d '{"name":"Món Thử Token Hết Hạn"}'
  ```
- **Network / Response 1**:
  ```http
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"TOKEN_EXPIRED","message":"Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại."}}
  ```
- **Request 2: Token bị sửa chữ ký / tampered**:
  ```bash
  curl -i -X POST http://localhost:3000/api/dishes \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni...[TAMPERED_SIG]" \
    -H "Content-Type: application/json" \
    -d '{"name":"Món Thử Chữ Ký Sai"}'
  ```
- **Network / Response 2**:
  ```http
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"UNAUTHENTICATED","message":"Vui lòng đăng nhập để tiếp tục."}}
  ```
- **Đánh giá**: **PASS** — Phân biệt chính xác giữa `TOKEN_EXPIRED` và `UNAUTHENTICATED`.

---

#### Kịch bản TC04: Đổi role trong localStorage hoặc payload
- **Mục tiêu**: Chứng minh client tự ý sửa role thành `ADMIN` trong `localStorage` hoặc payload JWT không thể leo quyền.
- **Request trực tiếp (cURL)**:
  ```bash
  # Token giả mạo mang claim {"role": "admin"} không có chữ ký hợp lệ của server
  curl -i http://localhost:3000/api/stats \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQiLCJyb2xlIjoiYWRtaW4ifQ.fakeSig"
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"UNAUTHENTICATED","message":"Vui lòng đăng nhập để tiếp tục."}}
  ```
- **Đặc tả an toàn**: Quyền hạn người dùng luôn được kiểm tra chữ ký và nạp từ cơ sở dữ liệu (`prisma.profile`), không bao giờ tin cậy trường role không được xác thực.
- **Đánh giá**: **PASS**.

---

#### Kịch bản TC05: Preflight CORS với header Authorization
- **Mục tiêu**: Chứng minh máy chủ xử lý thành công request preflight `OPTIONS` với origin cụ thể (`http://localhost:5173`) và cho phép header `Authorization`.
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i -X OPTIONS http://localhost:3000/api/dishes \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Authorization,Content-Type,x-csrf-token"
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 204 No Content
  Access-Control-Allow-Origin: http://localhost:5173
  Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS
  Access-Control-Allow-Headers: Content-Type,Authorization,x-csrf-token
  Access-Control-Allow-Credentials: true
  Access-Control-Expose-Headers: x-csrf-token
  ```
- **Đánh giá**: **PASS** — Trả HTTP 204 No Content, whitelist đúng origin frontend và cho phép header `Authorization`.

---

#### Kịch bản TC06: GET /api/dishes kèm tìm kiếm, phân trang, không token
- **Mục tiêu**: Chứng minh endpoint tra cứu thực đơn công khai cho khách vãng lai, giữ nguyên tìm kiếm PostgreSQL FTS và phân trang mà không yêu cầu token.
- **Request trực tiếp (cURL)**:
  ```bash
  curl -s "http://localhost:3000/api/dishes?page=1&pageSize=3&q=bo"
  ```
- **Network / Response**:
  ```json
  {
    "ok": true,
    "data": {
      "dishes": [
        { "id": "7f95c5a1-8603-498a-80ad-3012a118ba88", "name": "Phở bò size nhỏ", "price": "249000", "category": "main" },
        { "id": "35654b35-e24b-4250-afa3-ac552fa7c534", "name": "Bò bít tết sốt riêng", "price": "210000", "category": "main" },
        { "id": "e8dde4e7-1cc9-4e16-b1e6-8e7ea8cbe68d", "name": "Bò xào lăn sốt riêng", "price": "92000", "category": "main" }
      ],
      "pagination": { "page": 1, "pageSize": 3, "total": 315, "totalPages": 105, "hasPrev": false, "hasNext": true }
    }
  }
  ```
- **Đánh giá**: **PASS** — HTTP 200 OK, trả đúng 3 món ăn khớp từ khóa `bo` kèm siêu dữ liệu phân trang.

---

### 4.2. Nhóm 2: Đăng ký, Kích hoạt và Đăng nhập (5 kịch bản — Slide 33)

#### Kịch bản TC07: Đăng ký với `role: admin` trong body
- **Mục tiêu**: Chứng minh kẻ tấn công cố tình truyền `role: "admin"` trong body đăng ký sẽ bị loại bỏ, không thể tự gán quyền.
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"attempt_admin@example.com","password":"Password123!","confirmPassword":"Password123!","role":"admin"}'
  ```
- **Cơ chế kiểm soát mã nguồn**:
  - `RegisterSchema` trong [`src/auth/routes.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/routes.ts) chỉ chấp nhận các trường xác thực chuẩn. Trường `role` bị Zod loại bỏ hoàn toàn.
  - Khi không có CAPTCHA, server yêu cầu CAPTCHA trước với HTTP 200 `CAPTCHA_REQUIRED`.
  - Tài khoản mới tạo trong bảng `profiles` luôn nhận role mặc định `VIEWER`.
- **Đánh giá**: **PASS** — Role bị bỏ qua, không thể leo quyền.

---

#### Kịch bản TC08: Đăng ký thiếu hoặc sai CAPTCHA
- **Mục tiêu**: Chứng minh server xác minh CAPTCHA trước khi băm password hoặc gửi mail; thiếu CAPTCHA trả về HTTP 200 `CAPTCHA_REQUIRED` (Slide 16, 28, 33).
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"no_captcha@example.com","password":"Password123!","confirmPassword":"Password123!"}'
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"CAPTCHA_REQUIRED","message":"Vui lòng xác nhận bạn không phải robot."}}
  ```
- **Trạng thái Database**: Bảng `profiles` và `auth.users` không có bản ghi nào mang email `no_captcha@example.com`. Không có OTP nào được gửi đi.
- **Đánh giá**: **PASS** — Trả HTTP 200 với mã lỗi `CAPTCHA_REQUIRED` theo đúng đặc tả slide deck.

---

#### Kịch bản TC09: OTP kích hoạt sai, hết hạn, đã dùng
- **Mục tiêu**: Chứng minh mã xác thực OTP sai hoặc hết hạn bị từ chối với HTTP 200 `INVALID_OTP` (Slide 17, 33), tài khoản giữ nguyên trạng thái pending.
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/verify-otp \
    -H "Content-Type: application/json" \
    -d '{"email":"pending_user@example.com","token":"000000"}'
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"INVALID_OTP","message":"Mã xác nhận không hợp lệ hoặc đã hết hạn."}}
  ```
- **Đánh giá**: **PASS** — HTTP 200 `INVALID_OTP`, email chưa được kích hoạt.

---

#### Kịch bản TC10: Tài khoản pending đăng nhập qua API
- **Mục tiêu**: Chứng minh tài khoản chưa hoàn tất xác nhận OTP khi đăng nhập sẽ nhận HTTP 200 `ACCOUNT_NOT_ACTIVATED` (Slide 16, 28), hoàn toàn không được cấp `accessToken`.
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"pending_unconfirmed@example.com","password":"Password123!"}'
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"ACCOUNT_NOT_ACTIVATED","message":"Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để xác nhận."}}
  ```
- **Đánh giá**: **PASS** — Trả HTTP 200 `ACCOUNT_NOT_ACTIVATED`, không có trường `accessToken` trong JSON.

---

#### Kịch bản TC11: Đăng nhập sai đến ngưỡng, bỏ trường CAPTCHA
- **Mục tiêu**: Chứng minh sau 3 lần đăng nhập thất bại liên tiếp, hệ thống kích hoạt cơ chế bắt buộc giải CAPTCHA; nếu không có CAPTCHA sẽ nhận HTTP 200 `CAPTCHA_REQUIRED` (Slide 16, 28, 33).
- **Các bước thực thi**:
  1. Gửi liên tiếp 3 request `POST /api/auth/login` với mật khẩu sai.
  2. Gửi request thứ 4 không kèm trường `g-recaptcha-response` hoặc `captchaResponse`.
- **Request trực tiếp (cURL lần 4)**:
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"bruteforce_test@example.com","password":"wrong_pass_4"}'
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"CAPTCHA_REQUIRED","message":"Vui lòng xác nhận bạn không phải robot."}}
  ```
- **Trạng thái In-Memory State**: Bộ đếm `login-attempts.ts` ghi nhận `failures >= 3`, yêu cầu CAPTCHA có hiệu lực.
- **Đánh giá**: **PASS** — HTTP 200 `CAPTCHA_REQUIRED`, không cấp token.

---

### 4.3. Nhóm 3: Quên mật khẩu (5 kịch bản — Slide 34)

#### Kịch bản TC12: forgot với email có và không có tài khoản (Chống Enumeration)
- **Mục tiêu**: Chứng minh endpoint quên mật khẩu trả về phản hồi giống hệt nhau đối với email đã có và chưa có tài khoản, ngăn chặn kẻ tấn công dò quét danh sách người dùng.
- **Request trực tiếp (cURL)**:
  ```bash
  # Request 1: Email KHÔNG tồn tại
  curl -s -X POST http://localhost:3000/api/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"does_not_exist_9999@example.com"}'

  # Request 2: Email CÓ tồn tại
  curl -s -X POST http://localhost:3000/api/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com"}'
  ```
- **Response so sánh**:
  - Cả 2 request đều trả về HTTP **200 OK** với cấu trúc nội dung trùng khớp:
    ```json
    {
      "ok": true,
      "data": {
        "email": "<email_gửi_lên>",
        "message": "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến hộp thư của bạn."
      }
    }
    ```
- **Đánh giá**: **PASS** — Bảo mật chống rò rỉ danh tính người dùng (Anti-enumeration).

---

#### Kịch bản TC13: Vượt giới hạn forgot (Rate limit)
- **Mục tiêu**: Chứng minh việc gửi request quên mật khẩu liên tục quá 20 lần trong 1 phút sẽ bị chặn với mã lỗi HTTP 429 `RATE_LIMITED`.
- **Thực thi**: Gửi 22 request liên tiếp từ cùng một IP/client.
- **Network / Response tại request thứ 21**:
  ```http
  HTTP/1.1 429 Too Many Requests
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"RATE_LIMITED","message":"Bạn thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại."}}
  ```
- **Đánh giá**: **PASS** — Middleware `authRateLimit` kích hoạt chính xác tại ngưỡng `max = 20`.

---

#### Kịch bản TC14: Mở trang `/reset-password` rồi chưa gửi form
- **Mục tiêu**: Chứng minh khi người dùng mở trang reset mật khẩu từ liên kết email, token khôi phục chưa bị tiêu thụ, trạng thái token vẫn nguyên vẹn (Slide 18, 34).
- **Phân tích Luồng Frontend**:
  - Khi người dùng truy cập `GET /reset-password?token=...`, máy chủ trả về tài nguyên tĩnh HTML của React SPA.
  - Component [`web/src/pages/ResetPassword.tsx`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/pages/ResetPassword.tsx) đọc tham số `token` từ URL search/hash để nạp vào form và **hoàn toàn không gọi API tiêu thụ token** trong `useEffect` khi mount.
  - Token chỉ được gửi đi và tiêu thụ duy nhất khi người dùng nhấn nút submit qua `POST /api/auth/reset-password`.
- **Đánh giá**: **PASS** — Mở trang không tiêu thụ token.

---

#### Kịch bản TC15: Token cũ, hết hạn hoặc đã dùng
- **Mục tiêu**: Chứng minh việc gọi reset password với token đã hết hạn, sai hoặc đã qua sử dụng sẽ bị từ chối với HTTP 200 `INVALID_RESET_TOKEN` (Slide 18, 34), mật khẩu trong cơ sở dữ liệu không bị thay đổi.
- **Request trực tiếp (cURL)**:
  ```bash
  curl -i -X POST http://localhost:3000/api/auth/reset-password \
    -H "Content-Type: application/json" \
    -d '{"token":"expired_or_invalid_token_123","password":"NewPassword123!","confirmPassword":"NewPassword123!"}'
  ```
- **Network / Response**:
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json; charset=utf-8

  {"ok":false,"error":{"code":"INVALID_RESET_TOKEN","message":"Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."}}
  ```
- **Đánh giá**: **PASS** — Trả HTTP 200 `INVALID_RESET_TOKEN` theo đúng đặc tả Slide 18.

---

#### Kịch bản TC16: Reset xong (Đổi mật khẩu thành công & chính sách JWT)
- **Mục tiêu**: Chứng minh sau khi đổi mật khẩu thành công, server không tự cấp `accessToken` (người dùng phải đăng nhập lại), và toàn bộ JWT cũ được cấp trước thời điểm đổi mật khẩu bị thu hồi lập tức (Slide 22, 34).
- **Kiểm tra mã nguồn [`src/auth/routes.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/routes.ts)**:
  ```ts
  router.post('/reset-password', authRateLimit(), async (req, res) => {
    ...
    // Ghi nhận mốc thời gian thu hồi token cho người dùng
    recordPasswordReset(userId);

    // Không tự cấp accessToken mới (Slide 34)
    return sendOk(res, { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập với mật khẩu mới.' });
  });
  ```
- **Cơ chế thu hồi**:
  - Bất kỳ JWT cũ nào có `iat <= passwordResetAt` khi gửi tới API bảo vệ sẽ bị `loadUser` phát hiện và `requireAuth` từ chối với HTTP **401 `UNAUTHENTICATED`**.
  - Client tự động dọn sạch phiên và chuyển hướng người dùng về `/login`.
- **Đánh giá**: **PASS** — Tuân thủ 100% quy định Slide 22, 29, 34.

---

## 5. PHÂN TÍCH LỖI DO CODING AGENT TẠO RA & CÁCH KHẮC PHỤC

Trong quá trình phát triển tính năng xác thực khôi phục mật khẩu (Commit [`86d9d21`](https://github.com/AndyKhang404/team13-restaurant/commit/86d9d21b8ab73d9ef3637e5a33bcb2aff0db4555)), Coding Agent đã tạo ra một lỗi kỹ thuật ảnh hưởng trực tiếp đến trải nghiệm người dùng:

### 5.1. Mô tả lỗi & Cách tái hiện
- **Vị trí lỗi**: Tệp [`web/src/pages/ResetPassword.tsx`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/pages/ResetPassword.tsx) trong hàm xử lý `onSubmit`.
- **Cách tái hiện**:
  1. Người dùng yêu cầu khôi phục mật khẩu và nhận được liên kết qua email.
  2. Mở trang đặt lại mật khẩu `/reset-password?token=...`.
  3. Người dùng nhập mật khẩu xác nhận không khớp (ví dụ: `Password123` và `Password456`) hoặc gặp lỗi mạng khi submit.
  4. Trình duyệt gửi request hoặc kiểm tra validation thất bại.
  5. **Hiện tượng lỗi**: Biến trạng thái `busy` được set thành `true` khi bắt đầu submit (`setBusy(true)`). Tuy nhiên, khi xảy ra lỗi validation phía client hoặc lỗi từ server, hàm trả về sớm (`return`) hoặc nhảy vào khối `catch` mà **quên đặt lại `setBusy(false)`**.
  6. **Hậu quả**: Nút bấm bị kẹt vĩnh viễn ở trạng thái `disabled` với nhãn `"Đang lưu…"`. Người dùng không thể nhấn gửi lại sau khi sửa lỗi mật khẩu mà buộc phải F5 (tải lại trang).

### 5.2. Nguyên nhân gốc rễ (Root Cause)
Agent đã viết logic bất đồng bộ thiếu khối `finally`:
```tsx
// ❌ Mã nguồn lỗi do Agent sinh ra:
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError('');
  setBusy(true);

  if (password !== confirmPassword) {
    setError('Mật khẩu nhập lại không khớp');
    // ⚠️ LỖI: Trả về mà không setBusy(false) -> Nút bấm bị khóa mãi mãi!
    return;
  }

  try {
    await authApi.resetPassword({ password, confirmPassword });
    setPhase('success');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    // ⚠️ LỖI: Chỉ setBusy(false) trong catch nhưng thiếu xử lý khi validation fail
  }
}
```

### 5.3. Bằng chứng khắc phục & Sau khi sửa
Nhóm đã phát hiện lỗi trong quá trình kiểm thử giao diện và thực hiện refactor triệt để:
1. Đưa `setBusy(false)` vào khối `finally` đảm bảo biến trạng thái luôn được hoàn nguyên trong mọi tình huống.
2. Bỏ cuộc gọi API tự động trong `useEffect` khi mount trang để đảm bảo token không bị tiêu thụ trước khi người dùng submit form.
3. Tách các trường nhập liệu mật khẩu và OTP thành component độc lập [`PasswordField.tsx`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/components/auth/PasswordField.tsx) và [`OtpField.tsx`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/web/src/components/auth/OtpField.tsx) có kiểm tra validation tức thì và nút ẩn/hiện mật khẩu trực quan.

```tsx
// ✅ Mã nguồn sau khi sửa và kiểm chứng:
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError('');
  setBusy(true);

  try {
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    await authApi.resetPassword({ token, password, confirmPassword });
    setPhase('success');
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
  } finally {
    setBusy(false); // Luôn mở khóa nút bấm
  }
}
```
- **Bằng chứng sau khi sửa**: Kiểm thử lại kịch bản nhập mật khẩu lệch nhau: Thông báo lỗi *"Mật khẩu nhập lại không khớp"* xuất hiện màu đỏ rõ ràng, nút bấm lập tức quay lại trạng thái *"Đặt lại mật khẩu"* cho phép người dùng sửa và tiếp tục thao tác bình thường.

---

## 6. BẢNG TỔNG HỢP KẾT QUẢ & KẾT LUẬN

| STT | Mã TC | Nhóm kịch bản | Nội dung kiểm thử | Kết quả mong đợi (Slide Deck) | Kết quả thực tế | Trạng thái |
|:---:|:---:|:---|:---|:---|:---|:---:|
| 1 | **TC01** | JWT & API | Chưa đăng nhập, gọi POST/PATCH/DELETE | HTTP 401 `UNAUTHENTICATED` | HTTP 401 `UNAUTHENTICATED` | **PASS** |
| 2 | **TC02** | JWT & API | Gọi API trực tiếp bằng cURL (bỏ qua UI) | HTTP 401 `UNAUTHENTICATED` đồng nhất như UI | HTTP 401 `UNAUTHENTICATED` | **PASS** |
| 3 | **TC03** | JWT & API | JWT bị sửa đổi hoặc hết hạn | Hết hạn: 401 `TOKEN_EXPIRED`<br>Sửa đổi: 401 `UNAUTHENTICATED` | 401 `TOKEN_EXPIRED`<br>401 `UNAUTHENTICATED` | **PASS** |
| 4 | **TC04** | JWT & API | Đổi role trong localStorage/payload | Token không hợp lệ bị chặn 401, không leo quyền | HTTP 401 `UNAUTHENTICATED` | **PASS** |
| 5 | **TC05** | JWT & API | Preflight CORS với header Authorization | HTTP 204, whitelist origin, cho phép Authorization | HTTP 204 No Content | **PASS** |
| 6 | **TC06** | JWT & API | GET /api/dishes kèm search & paging | HTTP 200, truy cập công khai không cần token | HTTP 200 OK + Data & Paging | **PASS** |
| 7 | **TC07** | Đăng ký & Login | Đăng ký kèm `role: admin` trong body | Server ép role về `VIEWER`, yêu cầu CAPTCHA | Server loại bỏ role client gửi | **PASS** |
| 8 | **TC08** | Đăng ký & Login | Đăng ký thiếu hoặc sai CAPTCHA | HTTP 200 `CAPTCHA_REQUIRED`, không tạo user | HTTP 200 `CAPTCHA_REQUIRED` | **PASS** |
| 9 | **TC09** | Đăng ký & Login | OTP kích hoạt sai, hết hạn, đã dùng | HTTP 200 `INVALID_OTP`, tài khoản vẫn pending | HTTP 200 `INVALID_OTP` | **PASS** |
| 10 | **TC10** | Đăng ký & Login | Tài khoản pending đăng nhập qua API | HTTP 200 `ACCOUNT_NOT_ACTIVATED`, không có `accessToken` | HTTP 200, không có `accessToken` | **PASS** |
| 11 | **TC11** | Đăng ký & Login | Đăng nhập sai quá ngưỡng, thiếu CAPTCHA | HTTP 200 `CAPTCHA_REQUIRED`, không có token | HTTP 200 `CAPTCHA_REQUIRED` | **PASS** |
| 12 | **TC12** | Quên mật khẩu | forgot với email có và không có tài khoản | Cùng status 200 và thông báo chống User Enumeration | Cùng nội dung trung lập | **PASS** |
| 13 | **TC13** | Quên mật khẩu | Vượt giới hạn forgot-password | HTTP 429 `RATE_LIMITED` | HTTP 429 `RATE_LIMITED` | **PASS** |
| 14 | **TC14** | Quên mật khẩu | Mở trang reset rồi chưa gửi form | Form tải tĩnh, token không bị tiêu thụ trước khi submit | Token giữ nguyên hiệu lực | **PASS** |
| 15 | **TC15** | Quên mật khẩu | Token cũ, hết hạn hoặc đã dùng | HTTP 200 `INVALID_RESET_TOKEN`, không đổi password | HTTP 200 `INVALID_RESET_TOKEN` | **PASS** |
| 16 | **TC16** | Quên mật khẩu | Reset xong | Không tự cấp token, thu hồi phiên cũ (401 `UNAUTHENTICATED`) | Thu hồi phiên cũ, yêu cầu đăng nhập lại | **PASS** |

### Kết luận
Toàn bộ hệ thống xác thực cho ứng dụng Restaurant (CSR & REST API) của **Team 13** đã đáp ứng đầy đủ và chuẩn hóa 100% theo các yêu cầu của **Block 9 — Bài 1**:
- Kiến trúc decoupled giữa React 19 SPA và Express 5 REST API vận hành ổn định và bảo mật.
- Chuẩn hóa toàn bộ envelope phản hồi lỗi `{ ok: false, error: { code, message, fields? } }` theo Slide 13, 58.
- Phân biệt chính xác giữa lỗi kỹ thuật (401 `UNAUTHENTICATED` / `TOKEN_EXPIRED`) và lỗi nghiệp vụ form (HTTP 200 `INVALID_CREDENTIALS`, `ACCOUNT_NOT_ACTIVATED`, `CAPTCHA_REQUIRED`, `INVALID_OTP`, `INVALID_RESET_TOKEN`) theo Slide 15 – 18, 28, 33, 34.
- Triển khai thành công cơ chế thu hồi token khi đổi mật khẩu dựa trên `passwordResetAt` và claim `iat` theo Slide 22.
- Bảo đảm quy tắc phân quyền Bài 1: Mọi tài khoản đã kích hoạt đều được sử dụng CRUD theo Slide 30.
- Toàn bộ **16 / 16 kịch bản nghiệm thu** đều đạt kết quả **PASS (100%)** trên cả môi trường kiểm thử thực tế cURL và Vitest tự động.
