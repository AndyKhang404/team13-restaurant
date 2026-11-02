# Team13 Restaurant — SSR Web Application

An SSR web application for restaurant meal management and a public dining catalog, built with **Express**, **Handlebars**, **TypeScript**, **Tailwind CSS v4**, **Prisma ORM 7**, and **Supabase** (PostgreSQL + Storage). Authentication is implemented locally in this app (scrypt + database sessions + email OTP), not delegated to Supabase Auth.

## Team Members (Team 13)

| Name                |                      GitHub                      | Student ID |
| ------------------- | :----------------------------------------------: | ---------- |
| **Phùng Bảo Khang** | [@AndyKhang404](https://github.com/AndyKhang404) | 24127052   |
| **Nguyễn Minh Đức** |    [@JohnZ9696](https://github.com/JohnZ9696)    | 24127345   |
| **Hy Huê Hưng**     |   [@HungHy2314](https://github.com/HungHy2314)   | 24127388   |

## Key Features

### Public Dining Portal (`/`)

- **Homepage (`/`)**: hero showcase and chef-highlighted dishes.
- **Full Menu (`/menu`)**: grouped by category, filterable with live category pills and sold-out badges.
- **Dish Detail (`/dishes/:slug`)**: imagery, VND prices, prep time, ingredient names, and chef spotlight.

### Content Management (`/admin`)

Block 8 requires content CRUD to be available to **every ACTIVE account**, so the admin area is guarded by login, not by a staff role:

- Dashboard with dish, chef, ingredient, and user counts.
- Full create/read/update/soft-delete/restore for dishes, chefs, and ingredients.
- Image upload to Supabase Storage.
- Recipe proportions with dynamic ingredient rows.
- SEO slugs with Vietnamese diacritic stripping.
- User role management (`/admin/users`) remains restricted to `user:manage` (ADMIN) for Block 9.

### Local Authentication

- Registration with always-on server-side reCAPTCHA v2.
- Pending accounts receive a 6-digit OTP by email and cannot log in until activation.
- Activation OTP and resend endpoint with cooldown, hourly cap, attempt counter, and lockout.
- Login with scrypt password verification and generic error messages.
- Server-side sessions stored in PostgreSQL; the `sid` cookie contains only an opaque random value.
- Logout revokes the stored session; reusing the old `sid` fails.
- Forgot/reset password with hashed one-time tokens; reset revokes every session for that account.
- Brute-force policy keyed by **normalized email and IP**, independent of cookies.

## Roles

Block 8 only distinguishes “logged in” from “not logged in”:

| Capability | ACTIVE account | Guest |
| --- | :---: | :---: |
| Browse menu and dish details | Yes | Yes |
| Access `/admin` content CRUD | Yes | No (303 to `/login`) |
| Manage user roles (`user:manage`) | ADMIN only | No |

New registrations default to `VIEWER`. Detailed role/permission rules are intentionally deferred to Block 9.

## Tech Stack & Architecture

- **Backend / SSR**: Express 5 + Handlebars.
- **Styling**: Tailwind CSS v4 CLI.
- **Language**: TypeScript strict mode, NodeNext modules.
- **Database / ORM**: PostgreSQL via Supabase + Prisma ORM 7.
- **Authentication**: local scrypt password hashes, `sessions` table, OTP activation challenges, `nodemailer` SMTP.
- **Object Storage**: Supabase Storage (`images` bucket).
- **Security**: CSRF double-submit protection, Helmet headers, Zod validation, timing-safe password/OTP comparison.
- **Testing**: Vitest + Supertest.

## Getting Started

### Prerequisites

- Node.js v20 or newer (v22/v24 recommended).
- npm v10 or newer.
- A Supabase project (free tier).
- An SMTP inbox for OTP/reset mail (Mailtrap, Ethereal, or a Gmail app password).

### Configure environment

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL`: Supabase transaction pooler URL (port `6543`).
- `DIRECT_URL`: Supabase session/direct URL (port `5432`) for Prisma CLI.
- `SUPABASE_URL`: your project URL.
- `SUPABASE_SECRET_KEY`: service_role key, server-only (storage and seed).
- `STORAGE_BUCKET`: usually `images`.
- `CAPTCHA_SITE_KEY` / `CAPTCHA_SECRET_KEY`: Google reCAPTCHA v2 keys.
- `CSRF_SECRET`: 32+ random characters (`openssl rand -hex 32`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: mail delivery.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`: initial local admin.

Auth policy defaults can be overridden with `SESSION_TTL_DAYS`, `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_LOCK_MINUTES`, `OTP_RESEND_COOLDOWN_SECONDS`, and `OTP_MAX_SENDS_PER_HOUR`.

### Apply migrations and seed

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` creates/updates the local admin with a scrypt password hash, sets `status = ACTIVE`, and seeds chefs, ingredients, and dishes.

### Run

```bash
npm run dev
```

Open http://localhost:3000.

## Authentication Policy

### Registration and activation

- CAPTCHA is verified server-side before hashing the password or creating an account.
- Email is normalized with `trim().toLowerCase()`; `profiles.email_normalized` is unique and stores the lookup key, while `profiles.email` keeps the entered form.
- New accounts are created as `PENDING` with role `VIEWER`; no session is issued.
- OTP is 6 random digits, stored only as an HMAC-SHA256 digest.
- OTP TTL: **10 minutes** by default.
- Wrong OTP: **5 attempts** before a **15-minute** lock.
- Resend: **60-second** cooldown, at most **5 sends per hour** per account; attempts are not reset.
- Successful activation sets `status = ACTIVE` and `emailVerifiedAt`, then redirects with `303` to `/login`; it never auto-logs in.
- Unknown and existing emails receive the same registration response; duplicate registration never creates another user.

### Login and brute force

- Passwords are hashed with **scrypt** (`N=16384, r=8, p=1`, 64-byte key, random 16-byte salt).
- Unknown email and wrong password return the same `401` message. Unknown emails still run a dummy scrypt verification to reduce timing differences.
- After **3 failures** for the same normalized email or IP, CAPTCHA is required.
- After **10 failures**, the key is locked for **5 minutes** and returns `429` even with a valid CAPTCHA.
- A successful login clears the email counter but not the IP counter.
- Successful login rotates the session: any previous `sid` is revoked and a new database row is created.
- Login success and logout use `303` redirects.

### Sessions

- Table: `sessions(id, sid_hash, user_id, expires_at, created_at, last_seen_at, revoked_at)`.
- Cookie: `sid`, `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, TTL **7 days** by default.
- Only the SHA-256 digest of the cookie value is stored.
- `loadUser` rejects revoked, expired, or non-ACTIVE sessions; invalid sessions are revoked.
- Deleting cookies or opening a new anonymous browser does not reset the server-side counters.

### Password reset

- `POST /forgot` returns the same `200` body for existing and unknown emails.
- Token: random 32-byte value sent only in the email link; the database stores only its SHA-256 hash.
- Reset link TTL: **15 minutes**; links are single-use and claimed atomically.
- `GET /reset` only renders the form. `POST /reset` stores a new scrypt hash, revokes **all** sessions for the user, invalidates other reset tokens, clears the current cookie, and redirects with `303` to `/login`.
- After a successful reset the app sends a **"password changed"** notification email (never the password itself), so the owner learns if the reset was not theirs.
- The reset token is accepted **only** by `POST /reset`; no other route consumes it.
- Reset never signs the user in automatically and does not activate a pending account.
- Registration responds with the **same generic check-email page** for a new email and an already-registered email (no account enumeration); a pending account only re-issues the OTP under the normal cooldown/cap.

### CSRF

- All state-changing forms use the double-submit CSRF token.
- The anonymous browser id cookie is `bid`; it is separate from the authenticated `sid` cookie.
- Logout, activation, resend, register, login, forgot, reset, and all admin mutations submit `_csrf`.

## Testing & Code Quality

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

The test suite covers auth policy, OTP activation, session middleware, password reset, CSRF/rate-limit helpers, pagination, validation, and content routes.