# Block 10 — Supabase MFA (TOTP)

Tài liệu này mô tả tính năng xác thực hai lớp (2FA) dùng **Supabase Auth MFA** trên nhánh
`feat/block10`. Factor và secret nằm trong Supabase Auth; app chỉ lưu trạng thái không bí mật
trong bảng `public.mfa_states`.

## 1. Phạm vi

- Triển khai trên bản **CSR + REST API** (`feat/block10`); bốn cổng phân quyền và MFA được
  nghiệm thu bằng request trực tiếp tới API (mục 13).
- Mọi tài khoản đã đăng nhập đều có thể tự bật/tắt 2FA từ `/profile`.
- Bật 2FA là tuỳ chọn, không bắt buộc theo role.
- Admin có thể reset 2FA cho user mất thiết bị từ `/admin/users` (không áp dụng cho chính mình).

## 2. Kiến trúc

```text
Supabase Auth
  ├─ auth.mfa_factors       (TOTP secret, verified/unverified)
  └─ mfa.challenge/verify   (AAL1 → AAL2)

public.mfa_states
  ├─ enabled_at
  ├─ factor_id
  ├─ recovery_codes_enabled
  ├─ failed_attempts
  ├─ locked_until
  ├─ last_code_hash       (replay guard)
  └─ last_code_at

public.mfa_recovery_codes
  ├─ user_id
  ├─ code_hash            (HMAC-SHA256)
  └─ used_at
```

- `mfa_states` là **mirror trạng thái**, không chứa secret.
- `loadUser` đọc `aal` từ JWT và `mfa_states.enabled_at` để chặn token AAL1.
- Login dùng Supabase client **stateless** (không ghi cookie) cho tới khi MFA verify xong.

## 3. Database

Migrations:

- `20261116120000_add_mfa_state`
- `20261116130000_add_mfa_replay_guard`
- `20261116140000_add_app_recovery_codes`

```sql
CREATE TABLE "mfa_states" (
  "user_id" UUID PRIMARY KEY REFERENCES "profiles"("id") ON DELETE CASCADE,
  "factor_id" TEXT,
  "enabled_at" TIMESTAMPTZ(6),
  "recovery_codes_enabled" BOOLEAN NOT NULL DEFAULT false,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(6),
  "last_code_hash" TEXT,
  "last_code_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "mfa_states" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "mfa_recovery_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "mfa_recovery_codes_user_id_code_hash_key"
  ON "mfa_recovery_codes"("user_id", "code_hash");
CREATE INDEX "mfa_recovery_codes_user_id_idx"
  ON "mfa_recovery_codes"("user_id");

ALTER TABLE "mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;
```

RLS bật nhưng **không có policy**: chỉ Prisma/service role được truy cập. Các bảng này không
đụng tới cột nào của `profiles`.

## 4. Endpoints

| Method | Endpoint                        | Auth          | Mô tả                                                          |
| ------ | ------------------------------- | ------------- | -------------------------------------------------------------- |
| GET    | `/api/auth/mfa/status`          | AAL2          | Trạng thái bật, factor id, số recovery codes còn lại           |
| POST   | `/api/auth/mfa/enroll`          | Đã đăng nhập  | Bắt đầu enroll, trả QR + secret (yêu cầu cookie session)       |
| POST   | `/api/auth/mfa/enroll/verify`   | Đã đăng nhập  | Xác nhận mã đầu tiên, trả recovery codes một lần               |
| POST   | `/api/auth/mfa/verify`          | Public + CSRF | Hoàn tất login challenge bằng TOTP                             |
| POST   | `/api/auth/mfa`                 | Public + CSRF | Alias chuẩn deck (`{ challenge, code }`), hỗ trợ TOTP/recovery |
| POST   | `/api/auth/mfa/verify-recovery` | Public + CSRF | Dùng recovery code để tắt MFA và yêu cầu đăng nhập lại         |
| POST   | `/api/auth/mfa/disable`         | AAL2          | Tắt 2FA (password + mã hiện tại, yêu cầu cookie session)       |
| POST   | `/api/auth/mfa/recovery-codes`  | AAL2          | Tạo lại bộ recovery codes (password + mã, yêu cầu cookie)      |
| POST   | `/api/users/:id/mfa/reset`      | ADMIN         | Reset 2FA khi user mất thiết bị (không áp dụng cho chính mình) |

Business errors giữ contract `HTTP 200 + { ok:false, error:{ code, message } }`.

## 5. Luồng đăng nhập

1. `POST /api/auth/login` xác thực email/password bằng **stateless Supabase client**.
2. Server gọi `auth.getUser(session.access_token)` để lấy danh sách factor.
3. Nếu có factor `totp` hoặc `recovery_code` verified:
   - Upsert `mfa_states` (enabled, factor id).
   - Kiểm tra `locked_until`.
   - Tạo challenge in-memory (TTL 5 phút, tối đa 5 lần) và giữ `access_token`/`refresh_token`
     **server-side**.
   - Trả `{ mfaRequired: true, next: "mfa", challenge, challengeId, expiresIn, recoveryOnly }`.
   - Không trả token, không set cookie.
4. Client nhập mã:
   - `POST /api/auth/mfa/verify` (hoặc `POST /api/auth/mfa`) → `mfa.challengeAndVerify`.
   - Hoặc `POST /api/auth/mfa/verify-recovery` (hoặc `POST /api/auth/mfa` với recovery code) → verify recovery code cấp app; xoá factor +
     state, trả `reauthRequired` (không token); user đăng nhập lại bằng mật khẩu.
5. Server verify trên **stateless client**; chỉ khi thành công mới `setSession` vào cookie client
   và trả token AAL2.

`GET/POST /api/auth/callback` dùng **stateless Supabase client** và cùng luồng challenge để magic link/recovery link không phát cookie AAL1 trước khi qua MFA; `AuthCallback.tsx` chuyển hướng sang bước nhập mã tại `/login` khi nhận `mfaRequired`.

## 6. Luồng bật / tắt

### Bật

1. `POST /api/auth/mfa/enroll`:
   - Yêu cầu cookie session.
   - Dọn các factor `unverified` cũ.
   - `mfa.enroll({ factorType: 'totp', friendlyName: 'Team13 Restaurant' })`.
   - Trả `qr_code` (data URI), `secret`, `uri`, `factorId`.
2. `POST /api/auth/mfa/enroll/verify`:
   - Kiểm tra `locked_until` và replay guard (`last_code_hash`/`last_code_at`); mã sai tăng `failed_attempts` và trả số lần còn lại (khóa 15 phút sau 5 lần).
   - `mfa.challengeAndVerify`.
   - Upsert `mfa_states.enabled_at` + `factor_id`, reset bộ đếm lỗi và lưu `last_code_hash`/`last_code_at`.
   - Sinh 10 recovery codes cấp app, lưu HMAC-SHA256 vào `mfa_recovery_codes`, trả plaintext một lần.
   - Giữ session AAL2 hiện tại; chỉ `signOut({ scope: 'others' })` để huỷ session các thiết bị khác.
   - Trả recovery codes + token AAL2 mới (`token`/`accessToken`), không bắt đăng nhập lại.

### Tắt

1. Yêu cầu session AAL2.
2. Xác nhận lại password bằng stateless client.
3. Xác nhận TOTP hoặc recovery code cấp app.
4. `mfa.unenroll({ factorId })`.
5. Xoá `mfa_recovery_codes` + `mfa_states`, `recordPasswordReset`, `signOut({ scope: 'global' })`.

## 7. AAL enforcement

`src/auth/middleware.ts`:

- `loadUser` lấy `aal` từ `getClaims()` (hoặc payload JWT).
- Query profile kèm `mfaState.enabledAt`.
- Nếu user đã bật MFA nhưng token là `aal1`:
  - `req.user = null`
  - `req.mfaRequired = true`
  - `requireAuth` / `requirePermission` trả `401 MFA_REQUIRED`.
- `/api/auth/me` trả thêm `mfaEnabled` và `mfaRequired`.

Khi **bật** MFA, server giữ session AAL2 hiện tại và chỉ `signOut({ scope: 'others' })`.
Khi **tắt** MFA, server gọi `recordPasswordReset` và `signOut({ scope: 'global' })` để huỷ
mọi session cũ.

### 7.1 Đổi mật khẩu và đặt lại mật khẩu

`POST /api/auth/reset-password` phục vụ hai luồng tách biệt:

1. **Reset bằng email (chưa đăng nhập):** chỉ chấp nhận đúng một bằng chứng sở hữu hộp thư
   (`token_hash`, `email + otp`, hoặc `code`). Bằng chứng được xác minh bằng Supabase client
   **stateless** nên không tạo cookie phiên; sau khi đổi mật khẩu server đăng xuất mọi thiết bị
   (scope `global`) và xoá mọi auth cookie còn sót.
2. **Đổi mật khẩu khi đang đăng nhập:** luôn yêu cầu `currentPassword` và xác minh bằng
   stateless client. Nếu request có kèm token/OTP thì token đó vẫn phải xác minh hợp lệ —
   token rác không thể dùng để bỏ qua bước mật khẩu hiện tại.

Chặn vượt MFA: nếu tài khoản đã bật MFA mà request chỉ có token AAL1 (`req.mfaRequired`),
API trả ngay `401 MFA_REQUIRED`. Bearer token không còn được chấp nhận như bằng chứng đặt lại
mật khẩu, nên kẻ chỉ có mật khẩu không thể đổi mật khẩu để chiếm tài khoản.

## 8. Recovery codes (app-level)

Supabase Auth trên project này chưa bật recovery codes, nên app tự quản lý:

- 10 mã, mỗi mã 10 ký tự từ alphabet không nhập nhằng (`I/O/0/1` bị loại).
- DB chỉ lưu HMAC-SHA256 (key = `CSRF_SECRET`); plaintext trả về đúng một lần lúc enroll/rotate.
- Mỗi mã dùng một lần; `updateMany({ where: { id, usedAt: null } })` chống race.
- Dùng recovery code ở bước login sẽ:
  - Đánh dấu mã đã dùng.
  - Xoá toàn bộ factor MFA của user qua Supabase admin API.
  - Xoá `mfa_states` + các recovery codes còn lại.
  - Trả `reauthRequired: true` (không cấp token): xoá factor verified khiến Supabase
    revoke session AAL1 đang giữ, nên user đăng nhập lại bằng mật khẩu rồi bật lại 2FA
    trong `/profile`.
- UI có copy/download và checkbox xác nhận đã lưu mã.

## 9. Lockout

- Sai 5 lần → `mfa_states.locked_until = now + 15 phút`.
- Login kiểm tra lock trước khi tạo challenge.
- Challenge store cũng tự huỷ sau 5 lần hoặc 5 phút.
- Sai **mã khôi phục** (ở bước login, ở `/mfa/disable` và khi tạo lại mã) cũng tăng
  `failed_attempts` và khoá tài khoản, không chỉ mã TOTP.
- `/mfa/disable` và `/mfa/recovery-codes` kiểm tra lock trước khi xác minh mã.
- Rate limit bổ sung ở route (`authRateLimit`).

### 9.1 Chống dùng lại mã (RFC 6238 §5.2)

- Mã TOTP đã xác thực thành công được lưu hash (`last_code_hash`) + thời điểm (`last_code_at`).
- Áp dụng cho `/mfa/enroll/verify`, `/mfa/verify`, `/mfa/disable` và `/mfa/recovery-codes`; mã cũ
  trong cửa sổ 90 giây bị từ chối với `INVALID_MFA_CODE`.
- Mã khôi phục cấp app luôn dùng một lần (`used_at`).

## 10. Giới hạn đã biết

- Các thao tác `mfa.enroll`, `mfa.enroll/verify`, `mfa.disable`, `mfa.recovery-codes` cần session thật trong
  client (cookie) vì `@supabase/auth-js` dùng `_useSession()` (đòi session kèm refresh token trong storage).
  Nếu request chỉ có Bearer token và không có cookie, API trả `MFA_SESSION_REQUIRED` và yêu cầu đăng nhập lại.
- Challenge store và token-revocation store (`passwordResetAt`) đều là in-memory: chỉ áp dụng cho single Node process; restart server sẽ xoá trạng thái in-memory.
- `mfa.verify` của Supabase đăng xuất các session khác.
- `mfa_states` có thể lệch với Supabase nếu factor bị xoá ngoài app; login sẽ reconcile:
  - Có factor nhưng thiếu state → tạo state.
  - Có state nhưng không còn factor → xoá state.
- Dùng recovery code sẽ **tắt MFA** và yêu cầu đăng nhập lại bằng mật khẩu; đây là hành vi
  có chủ đích vì xoá factor verified khiến Supabase revoke session AAL1 đang giữ.
- Password reset không tắt MFA; user vẫn cần TOTP khi đăng nhập lại.
- Recovery codes hash bằng HMAC key `CSRF_SECRET`; đổi secret sẽ làm các mã cũ không dùng
  được (user tạo lại mã hoặc admin reset).

## 11. Kiểm thử

```bash
npm run db:generate
npm run typecheck
npm test
```

Test tự động:

- `tests/mfa-challenges.test.ts`: TTL, attempts, single-use.
- `tests/auth-mfa.test.ts`: login challenge, callback stateless MFA, `/api/auth/mfa` alias, verify, lockout, enroll/verify lock & replay, disable, status, AAL enforcement, cookie token revocation, admin reset.
- `tests/policy.test.ts` & `tests/route-rbac.test.ts`: RBAC (ADMIN/STAFF/VIEWER, ADMIN-only delete), ABAC (`SUSPENDED`/`PENDING`, ownership trên edit-form GETs & mutations, field-level `chefId`/`isFeatured`).

Manual QA:

1. Đăng nhập, vào `/profile`, bật 2FA, quét QR bằng Google Authenticator/Authy.
2. Nhập mã 6 số, lưu recovery codes.
3. Bật xong vẫn đang đăng nhập; đăng xuất rồi đăng nhập lại → phải nhập TOTP.
4. Nhập sai 5 lần → khoá 15 phút.
5. Dùng recovery code → MFA tắt, đăng nhập lại bằng mật khẩu.
6. Tắt 2FA bằng password + mã; đăng nhập lại không cần TOTP.
7. Admin vào `/admin/users` → "Reset 2FA" cho user khác.

## 12. Cấu hình Supabase

- TOTP MFA được bật mặc định trên các project Supabase.
- Nếu dùng self-host: `MFA_TOTP_ENROLL_ENABLED=true`, `MFA_TOTP_VERIFY_ENABLED=true`.
- Recovery codes do app quản lý nên không phụ thuộc tính năng experimental của Supabase.

## 13. Nghiệm thu bằng request trực tiếp

Deck yêu cầu nghiệm thu bằng request trực tiếp, không chỉ thao tác qua giao diện. Các lệnh
dưới đây gọi API (Bearer token được miễn CSRF), thay `$BASE`, `$TOKEN`, `$DISH_ID` bằng giá
trị thật.

### 13.1 Bốn cổng phân quyền

```bash
# Cổng 1 — chưa biết người gọi
curl -i "$BASE/api/stats"                        # 401 UNAUTHENTICATED

# Cổng 2 — role không có quyền (kể cả STAFF gọi DELETE)
curl -i -H "Authorization: Bearer $VIEWER" "$BASE/api/stats"          # 403 FORBIDDEN
curl -i -X DELETE -H "Authorization: Bearer $VIEWER" \
  "$BASE/api/dishes/$DISH_ID"                                          # 403 FORBIDDEN
curl -i -X DELETE -H "Authorization: Bearer $STAFF" \
  "$BASE/api/dishes/$DISH_ID"                                          # 403 FORBIDDEN

# Cổng 3 — bản ghi không tồn tại
curl -i -X DELETE -H "Authorization: Bearer $ADMIN" \
  "$BASE/api/dishes/00000000-0000-4000-8000-000000000000"              # 404/NOT_FOUND

# Cổng 4 — ABAC: STAFF mở form sửa hoặc sửa nội dung của người khác
curl -i -H "Authorization: Bearer $STAFF" \
  "$BASE/api/chefs/$CHEF_OF_ANOTHER_STAFF"                             # 403 NOT_OWNER
curl -i -X PATCH -H "Authorization: Bearer $STAFF" \
  -H 'Content-Type: application/json' -d '{"name":"X"}' \
  "$BASE/api/dishes/$DISH_OF_ANOTHER_STAFF"                            # 403 NOT_OWNER
```

Gửi kèm `role`, `createdBy`, `chefId` hoặc `isFeatured` giả trong body cũng không nâng được quyền: server lấy danh tính từ token và kiểm tra quyền/thuộc tính từ database.

### 13.2 MFA

```bash
# Đăng nhập tài khoản đã bật MFA: chỉ trả challenge, không token, không Set-Cookie
curl -i -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"..."}'
# → { "mfaRequired": true, "next": "mfa", "challenge": "...", "challengeId": "...", "expiresIn": 300 }

# Mã sai → INVALID_MFA_CODE kèm số lần còn lại (hỗ trợ cả /api/auth/mfa và /api/auth/mfa/verify)
curl -i -X POST "$BASE/api/auth/mfa" -H 'Content-Type: application/json' \
  -d '{"challenge":"...","code":"000000"}'

# Dùng lại đúng mã vừa đăng nhập thành công → INVALID_MFA_CODE (RFC 6238 §5.2)

# Sai 5 lần → MFA_LOCKED (15 phút); mã khôi phục sai cũng bị khoá

# Token AAL1 (chỉ có mật khẩu) không đổi được mật khẩu
curl -i -X POST "$BASE/api/auth/reset-password" \
  -H "Authorization: Bearer $AAL1_TOKEN" -H 'Content-Type: application/json' \
  -d '{"password":"newpass123","confirmPassword":"newpass123"}'       # 401 MFA_REQUIRED

# Admin không tự reset MFA của mình (phải dùng /mfa/disable với password + mã)
curl -i -X POST -H "Authorization: Bearer $ADMIN" \
  "$BASE/api/users/$ADMIN_ID/mfa/reset"                                # 403 FORBIDDEN
```

Kiểm tra reset bằng email không tạo phiên: response không có `accessToken` và không có
`Set-Cookie` chứa `sb-...-auth-token`.

## 14. Đối chiếu và Nghiệm thu theo Deck Block 9 (Bài 2 — Slides 59–69)

### 14.1 Bảng nghiệm thu RBAC & ABAC (Slide 67)

| Kịch bản (Slide 67) | Ánh xạ trong codebase | Kết quả chứng minh | Test / Điểm kiểm tra |
| --- | --- | --- | --- |
| Chưa đăng nhập vào quản trị | `requireAuth` / `requirePermission` | `401 UNAUTHENTICATED` (không 303 vì SPA/API) | `tests/bearer-auth.test.ts`, `tests/block9-contracts.test.ts` |
| Đăng nhập, thiếu role để ghi / xóa | `VIEWER` ghi/sửa/xóa hoặc `STAFF` (`Editor`) gọi `DELETE` | `403 FORBIDDEN`, dữ liệu DB không đổi; nút Xóa ẩn với `STAFF` | `tests/permissions.test.ts`, `tests/route-rbac.test.ts` |
| Có role, thuộc tính bản ghi không thỏa | `STAFF` sửa/xem form sửa row của người khác hoặc legacy `createdBy=null`; tài khoản `SUSPENDED` / `PENDING` | `403 NOT_OWNER` / `403 ACCOUNT_SUSPENDED` / `403 ACCOUNT_NOT_ACTIVATED` | `tests/policy.test.ts`, `tests/route-rbac.test.ts` |
| Mở form sửa (GET) và gửi PATCH/PUT | `GET /api/chefs/:id`, `GET /api/ingredients/:id`, `GET /api/dishes/form-deps?dishId=` + `PATCH/PUT` kiểm tra lại DB | Cả GET form sửa lẫn PATCH/PUT đều kiểm tra 4 cổng; UI disable toàn bộ form khi `!canEdit` hoặc lỗi 403 | `src/modules/*/routes.ts`, `tests/route-rbac.test.ts` |
| Gửi PATCH/POST trực tiếp bỏ qua form | Gọi API trực tiếp không qua SPA | Kết quả y hệt qua form | `tests/route-rbac.test.ts` |
| Giả mạo `createdBy`, `role`, `chefId`, `isFeatured` | `POST/PATCH /api/dishes`, `POST /api/chefs` | `createdBy` luôn lấy từ `req.user.id`; `STAFF` đặt/đổi `chefId` hoặc `isFeatured` bị chặn `403 FORBIDDEN` | `checkDishAdminFields` (`src/auth/policy.ts`) |

### 14.2 Bảng nghiệm thu MFA (Slide 68)

| Kịch bản (Slide 68) | Ánh xạ trong codebase | Kết quả chứng minh | Test / Điểm kiểm tra |
| --- | --- | --- | --- |
| Password / callback đúng, chưa nhập OTP | `handleLogin` & `handleAuthCallback` (stateless client) + `loadUser` AAL2 gate | Chỉ trả `{ mfaRequired: true, next: "mfa", challenge, challengeId }`, không token/cookie AAL1; token AAL1 nhận `401 MFA_REQUIRED` | `tests/auth-mfa.test.ts` |
| OTP sai quá giới hạn hoặc mã dùng lại | `handleMfaEnrollVerify`, `handleMfaVerify`, `handleMfaDisable`, `handleMfaRecoveryCodes` | 5 lần sai → `MFA_LOCKED` (15 phút); mã dùng lại trong 90s → `INVALID_MFA_CODE` | `tests/auth-mfa.test.ts` |
| Recovery code dùng lần hai | `prisma.mfaRecoveryCode.updateMany({ where: { id, usedAt: null } })` | Từ chối (`INVALID_RECOVERY_CODE`) | `tests/auth-mfa.test.ts` |
| Reset password xong, đăng nhập | `handleResetPassword` không đụng `mfa_states`/Supabase factors; `recordPasswordReset` thu hồi cả Bearer lẫn Cookie | Session cũ (`iat <= resetAt`) bị `401 UNAUTHENTICATED`; lần đăng nhập sau vẫn qua bước MFA | `tests/auth-mfa.test.ts`, `tests/block9-contracts.test.ts` |

### 14.3 Sai lệch được chấp nhận (Accepted Deviations)

Do yêu cầu **không thay đổi DB schema / migration** và **giữ nguyên kiến trúc SPA + REST API**, các điểm sau khác với ví dụ SSR trong slide và được ghi nhận có chủ đích:

1. **CSR + REST API thay vì SSR (Slide 58 vs Bài 2):** Chưa đăng nhập trả JSON `401 UNAUTHENTICATED`, thiếu quyền trả JSON `403 FORBIDDEN`/`NOT_OWNER` thay vì `303 /login` và trang HTML 403.
2. **Tên role `ADMIN` / `STAFF` / `VIEWER`:** `STAFF` ánh xạ tương đương `Editor` trong deck; quyền `*:delete` đã được gỡ khỏi `STAFF` để khớp bảng quyền `Editor` (chỉ `ADMIN` xóa; `restore` giữ theo quyền `*:update` trên row sở hữu).
3. **Mô hình thuộc tính ABAC không đổi schema:** Code dùng `createdBy` (chủ sở hữu bản ghi) và `Profile.status` (`PENDING`/`ACTIVE`/`SUSPENDED`) thay cho `User.chefId` + `Dish.chefId` + `Dish.status` (`draft`/`published`). Trường `Dish.chefId` và `Dish.isFeatured` được khóa ở mức field-ABAC cho `ADMIN`.
4. **Hành vi Recovery Code khi đăng nhập:** Dùng recovery code hợp lệ sẽ đánh dấu đã dùng, xoá MFA factor/state và trả `reauthRequired: true` (yêu cầu đăng nhập lại bằng mật khẩu) thay vì giữ MFA bật và cấp session trực tiếp, vì xoá verified factor khiến Supabase thu hồi session AAL1 đang giữ.
5. **Lưu trữ in-memory (single process):** `mfa-challenges` và `token-revocation` lưu trong bộ nhớ Node process hiện tại.
6. **Cookie session cho quản lý MFA:** `/mfa/enroll`, `/mfa/enroll/verify`, `/mfa/disable`, `/mfa/recovery-codes` yêu cầu cookie session (trả `MFA_SESSION_REQUIRED` nếu chỉ gửi Bearer token) do giới hạn của `@supabase/auth-js` (`_useSession()`).

