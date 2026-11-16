# Block 10 — Supabase MFA (TOTP)

Tài liệu này mô tả tính năng xác thực hai lớp (2FA) dùng **Supabase Auth MFA** trên nhánh
`feat/mfa`. Factor và secret nằm trong Supabase Auth; app chỉ lưu trạng thái không bí mật
trong bảng `public.mfa_states`.

## 1. Phạm vi

- Mọi tài khoản đã đăng nhập đều có thể tự bật/tắt 2FA từ `/profile`.
- Bật 2FA là tuỳ chọn, không bắt buộc theo role.
- Admin có thể reset 2FA cho user mất thiết bị từ `/admin/users`.

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

| Method | Endpoint                        | Auth          | Mô tả                                                  |
| ------ | ------------------------------- | ------------- | ------------------------------------------------------ |
| GET    | `/api/auth/mfa/status`          | AAL2          | Trạng thái bật, factor id, số recovery codes còn lại   |
| POST   | `/api/auth/mfa/enroll`          | Đã đăng nhập  | Bắt đầu enroll, trả QR + secret                        |
| POST   | `/api/auth/mfa/enroll/verify`   | Đã đăng nhập  | Xác nhận mã đầu tiên, trả recovery codes một lần       |
| POST   | `/api/auth/mfa/verify`          | Public + CSRF | Hoàn tất login challenge bằng TOTP                     |
| POST   | `/api/auth/mfa/verify-recovery` | Public + CSRF | Dùng recovery code để tắt MFA và yêu cầu đăng nhập lại |
| POST   | `/api/auth/mfa/disable`         | AAL2          | Tắt 2FA (password + mã hiện tại)                       |
| POST   | `/api/auth/mfa/recovery-codes`  | AAL2          | Tạo lại bộ recovery codes                              |
| POST   | `/api/users/:id/mfa/reset`      | ADMIN         | Reset 2FA khi user mất thiết bị                        |

Business errors giữ contract `HTTP 200 + { ok:false, error:{ code, message } }`.

## 5. Luồng đăng nhập

1. `POST /api/auth/login` xác thực email/password bằng **stateless Supabase client**.
2. Server gọi `auth.getUser(session.access_token)` để lấy danh sách factor.
3. Nếu có factor `totp` hoặc `recovery_code` verified:
   - Upsert `mfa_states` (enabled, factor id).
   - Kiểm tra `locked_until`.
   - Tạo challenge in-memory (TTL 5 phút, tối đa 5 lần) và giữ `access_token`/`refresh_token`
     **server-side**.
   - Trả `{ mfaRequired: true, challengeId, expiresIn, recoveryOnly }`.
   - Không trả token, không set cookie.
4. Client nhập mã:
   - `POST /api/auth/mfa/verify` → `mfa.challengeAndVerify`.
   - Hoặc `POST /api/auth/mfa/verify-recovery` → verify recovery code cấp app; xoá factor +
     state, trả `reauthRequired` (không token); user đăng nhập lại bằng mật khẩu.
5. Server verify trên **stateless client**; chỉ khi thành công mới `setSession` vào cookie client
   và trả token AAL2.

`GET/POST /api/auth/callback` dùng cùng logic để magic link/recovery link không bypass MFA.

## 6. Luồng bật / tắt

### Bật

1. `POST /api/auth/mfa/enroll`:
   - Yêu cầu cookie session.
   - Dọn các factor `unverified` cũ.
   - `mfa.enroll({ factorType: 'totp', friendlyName: 'Team13 Restaurant' })`.
   - Trả `qr_code` (data URI), `secret`, `uri`, `factorId`.
2. `POST /api/auth/mfa/enroll/verify`:
   - `mfa.challengeAndVerify`.
   - Upsert `mfa_states.enabled_at` + `factor_id`.
   - Sinh 10 recovery codes cấp app, lưu SHA-256 vào `mfa_recovery_codes`, trả plaintext một lần.
   - `recordPasswordReset` + `signOut({ scope: 'global' })`.
   - Trả recovery codes + `reauthRequired: true`.

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

Ngoài ra, khi bật/tắt MFA server gọi `recordPasswordReset` và
`signOut({ scope: 'global' })` để huỷ mọi session cũ.

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
- Rate limit bổ sung ở route (`authRateLimit`).

## 10. Giới hạn đã biết

- Các thao tác `mfa.enroll`, `mfa.disable`, `mfa.recovery-codes` cần session thật trong
  client (cookie). Nếu request chỉ có Bearer token và không có cookie, API trả
  `MFA_SESSION_REQUIRED` và yêu cầu đăng nhập lại.
- Challenge store là in-memory: restart server → user phải đăng nhập lại.
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
- `tests/auth-mfa.test.ts`: login challenge, verify, lockout, enroll, disable, status,
  AAL enforcement, admin reset.

Manual QA:

1. Đăng nhập, vào `/profile`, bật 2FA, quét QR bằng Google Authenticator/Authy.
2. Nhập mã 6 số, lưu recovery codes.
3. Đăng xuất, đăng nhập lại → phải nhập TOTP.
4. Nhập sai 5 lần → khoá 15 phút.
5. Dùng recovery code → MFA tắt, đăng nhập lại bằng mật khẩu.
6. Tắt 2FA bằng password + mã; đăng nhập lại không cần TOTP.
7. Admin vào `/admin/users` → "Reset 2FA" cho user khác.

## 12. Cấu hình Supabase

- TOTP MFA được bật mặc định trên các project Supabase.
- Nếu dùng self-host: `MFA_TOTP_ENROLL_ENABLED=true`, `MFA_TOTP_VERIFY_ENABLED=true`.
- Recovery codes do app quản lý nên không phụ thuộc tính năng experimental của Supabase.
