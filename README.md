# Team13 Restaurant — React CSR & REST API Web Application

A modern client-side rendered (CSR) web application for restaurant meal management and public dining catalog, built with **React 19**, **Vite**, **React Router v7**, **Express 5 REST API**, **TypeScript**, **Tailwind CSS v4**, **Prisma ORM 7**, and **Supabase** (PostgreSQL, Auth, Storage).

---

## 🌟 Key Features

### 1. Public Dining Portal (`/`)

- **Homepage (`/`)**: Hero carousel, chef-highlighted dishes (`isFeatured`), and brand ticker.
- **Menu & Dish Catalog (`/dishes`)**: Category filter pills (`appetizer`, `main`, `dessert`, `drink`, `combo`), server-side keyword search via query parameter (`/dishes?q=...`), price/name sorting, and real-time **"Sold out"** badges. Server pagination supports `page` and `pageSize` (default 20, max 100) with switchable **infinite scroll / load more / numbered pages** modes; all paging/filter state is URL-backed.
- **Dish Detail (`/dishes/:id` & `/dishes/:slug`)**: High-resolution dish imagery, formatted pricing in VND, preparation time, ingredient breakdown (names only, protecting internal inventory costs), and creator Chef spotlight. Supports direct lookup by both UUID `id` and SEO `slug`.

### 2. Admin Operations Portal (`/admin`)

- **Dashboard (`/admin`)**: Real-time business metrics across active dishes, chefs, ingredients, and registered users, plus quick-action shortcuts.
- **Meal CRUD (`/admin/dishes`)**:
  - Full create, read, update, soft-delete, and restore lifecycle.
  - Inline confirmation modal (`<ConfirmDeleteModal />`) for zero-redirect deletion.
  - Image upload to Supabase Storage with live preview and removal toggle.
  - Recipe proportioning: dynamic multi-row ingredient selector with auto-filled units and quantities.
  - Automatic Vietnamese diacritic-stripped SEO slugs (`Phở Bò` → `pho-bo`), collision-safe (`pho-bo-2`).
- **Chefs Management (`/admin/chefs`)**: Manage chef profiles, culinary specialties, biographies, and portrait uploads.
- **Ingredients Inventory (`/admin/ingredients`)**: Track inventory quantities, units (`g`, `kg`, `ml`), unit wholesale prices, and availability status.
- **User Role Management (`/admin/users`)**: Exclusively available to `ADMIN`. Role alteration with safety locks preventing self-demotion and ensuring the last remaining `ADMIN` cannot be demoted.

### 3. Role-Based Access Control (RBAC)

| Capability                                | ADMIN | STAFF | CUSTOMER | Guest |
| ----------------------------------------- | :---: | :---: | :------: | :---: |
| Browse Menu & View Meal Details           |  ✅   |  ✅   |    ✅    |  ✅   |
| Access Admin Dashboard (`/admin`)         |  ✅   |  ✅   |    ❌    |  ❌   |
| Create, Edit, Soft-delete Meals & Recipes |  ✅   |  ✅   |    ❌    |  ❌   |
| Manage Chefs & Ingredients Inventory      |  ✅   |  ✅   |    ❌    |  ❌   |
| Change User Roles (`user:manage`)         |  ✅   |  ❌   |    ❌    |  ❌   |

---

## 🛠️ Architecture & Tech Stack

### Frontend (Client-Side Rendering — SPA)

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Routing**: [React Router DOM v7](https://reactrouter.com/) (declarative client-side routing with layout wrappers)
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite`, combined with hand-written CSS in `web/src/styles/public.css` and `web/src/styles/admin.css` (entry: `web/src/index.css`).
- **State & Context**:
  - `AuthProvider`: Session bootstrap via `GET /api/auth/me`, login, logout, and role-aware redirects.
  - `useTheme` (`ThemeSwitch.tsx`): Persistent light/dark mode switcher.
  - Page-level `useApi`: Local loading/error/data state; no global list/record store.
- **HTTP Client**: Typed wrapper `apiFetch<T>` with automatic CSRF token header (`x-csrf-token`) injection and standardized error unboxing.

### Backend (Decoupled REST API)

- **Runtime**: [Express 5](https://expressjs.com/) on Node.js (TypeScript, ES modules)
- **Database / ORM**: PostgreSQL via Supabase + [Prisma ORM 7](https://www.prisma.io/) with `@prisma/adapter-pg`
- **Authentication**: Supabase Auth supporting `Authorization: Bearer <token>` header (primary for SPA / REST clients) and HTTP-only session cookies (`@supabase/ssr` fallback) + lazy `Profile` sync
- **Object Storage**: Supabase Storage (`images` bucket for meals, chefs, and ingredients)
- **Security**:
  - `Authorization: Bearer <token>` support for REST API endpoints and CSRF-exempt header authentication.
  - Double-submit CSRF protection (`csrf-csrf`) for browser cookie sessions.
  - HTTP security headers (`helmet`).
  - CORS with an explicit `SPA_ORIGIN` allowlist and credentials; localhost/127.0.0.1 origins are allowed in development.
  - Rate limiting with standardized `RATE_LIMITED` JSON error responses.
  - Request validation using [Zod](https://zod.dev/).
- **SPA Fallback**: Express serves `dist/client/index.html` for non-API client routes in production.

### Standardized JSON Response Shape

The API distinguishes business errors from technical/security errors:

- **Success (`2xx`)**:
  ```json
  {
    "ok": true,
    "data": { ... }
  }
  ```
- **Business errors (`HTTP 200`)**:
  ```json
  {
    "ok": false,
    "error": {
      "code": "UPPER_SNAKE_CASE",
      "message": "Human readable message",
      "fields": { "fieldName": "Field error message" }
    }
  }
  ```
  Handled business errors such as `VALIDATION_FAILED`, `NOT_FOUND`, and `ALREADY_EXISTS` intentionally use HTTP 200 so the SPA can branch on `error.code` and show the real message instead of a generic HTTP failure.
- **Technical/security errors (`4xx` / `5xx` or auth/rate-limit flows)**:
  ```json
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Human readable message"
    }
  }
  ```
  These use the real HTTP status. Most omit `ok`; auth and rate-limit responses may still include `ok:false` as an out-of-contract exception.

Common error codes include: `VALIDATION_FAILED`, `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED`, `AUTH_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `ALREADY_EXISTS`, `CONFLICT`, `SELF_ROLE_CHANGE`, `LAST_ADMIN`, `RATE_LIMITED`, `CSRF_INVALID`, `UPLOAD_LIMIT_EXCEEDED`, `INTERNAL_ERROR`.

---

## 📡 REST API Overview

All protected endpoints accept authentication via `Authorization: Bearer <access_token>` header or session cookies.
Mutating endpoints using `Authorization: Bearer <token>` bypass double-submit CSRF enforcement (since cross-origin requests cannot attach custom headers without CORS preflight).
Legacy `/api/admin/*` routes remain fully supported as backward-compatibility aliases to `/api/*`.

| Route                          |         Method          |     Access     | Description                                                                 |
| ------------------------------ | :---------------------: | :------------: | --------------------------------------------------------------------------- |
| `/api/auth/me`                 |           GET           |     Public     | Current profile and CSRF token                                              |
| `/api/auth/login`              |          POST           |     Public     | Sign in with email and password (returns session token)                     |
| `/api/auth/register`           |          POST           |     Public     | Register new account (returns session token)                                |
| `/api/auth/logout`             |          POST           | Authenticated  | Clear session cookies / invalidate session                                  |
| `/api/auth/callback`           |        GET/POST         |     Public     | Supabase OAuth / email verification callback                                |
| `/api/home`                    |           GET           |     Public     | Featured dishes for the home page                                           |
| `/api/menu`                    |           GET           |     Public     | Full visible dish catalog; optional `q`, `category`, `sort` (no pagination) |
| `/api/dishes`                  |        GET, POST        | Public / Staff | List catalog with server pagination (`page`, `pageSize` ≤ 100), `q`, `category`, `sort`; create dish (`dish:create`) |
| `/api/dishes/:idOrSlug`        | GET, PATCH, PUT, DELETE | Public / Staff | View dish (public); update / soft-delete (`dish:update`/`delete`)           |
| `/api/dishes/:id/restore`      |          POST           | Staff / Admin  | Restore soft-deleted dish                                                   |
| `/api/dishes/form-deps`        |           GET           | Staff / Admin  | Active chefs and ingredients options for dish editor                        |
| `/api/chefs`                   |        GET, POST        | Staff / Admin  | List chefs with pagination (`page`, `pageSize`) & search; create new chef profile |
| `/api/chefs/:id`               | GET, PATCH, PUT, DELETE | Staff / Admin  | View, update, or soft-delete chef                                           |
| `/api/chefs/:id/restore`       |          POST           | Staff / Admin  | Restore soft-deleted chef                                                   |
| `/api/ingredients`             |        GET, POST        | Staff / Admin  | List ingredients with pagination (`page`, `pageSize`) & search; create new ingredient |
| `/api/ingredients/:id`         | GET, PATCH, PUT, DELETE | Staff / Admin  | View, update, or soft-delete ingredient                                     |
| `/api/ingredients/:id/restore` |          POST           | Staff / Admin  | Restore soft-deleted ingredient                                             |
| `/api/stats`                   |           GET           | Staff / Admin  | Dashboard summary counts (dishes, chefs, ingredients, users)                |
| `/api/users`                   |           GET           |   Admin only   | List registered users with pagination (`page`, `pageSize`) & search                              |
| `/api/users/:id/role`          |       PATCH, POST       |   Admin only   | Change user role (`CUSTOMER`, `STAFF`, `ADMIN`)                             |
| `/api/admin/*`                 |           ANY           | Staff / Admin  | Backward-compatibility aliases for `/api/*` management endpoints            |

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js**: v20 or higher (v22 / v24 LTS recommended)
- **npm**: v10 or higher
- A **Supabase** project (free tier)

### 2. Configure Environment Variables

Copy `.env.example` to `.env` for the server, and `web/.env.example` to `web/.env` for the frontend client:

```bash
cp .env.example .env
cp web/.env.example web/.env
```

Fill in the values in `.env`:

- `NODE_ENV`: `development`, `production`, or `test`
- `PORT`: API server port (default `3000`)
- `APP_URL`: public server URL used by Supabase auth redirects
- `DATABASE_URL`: Supabase Transaction Pooler URL (port `6543`)
- `DIRECT_URL`: Supabase Session / Direct connection URL (port `5432`)
- `SUPABASE_URL`: Your Supabase project URL (`https://<project-ref>.supabase.co`)
- `SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key
- `SUPABASE_SECRET_KEY`: Supabase secret key (`service_role` for admin & storage bypass)
- `STORAGE_BUCKET`: `images` (auto-created by seed script if missing)
- `CSRF_SECRET`: 32+ character random string (e.g. `openssl rand -hex 32`)
- `SPA_ORIGIN`: Allowed browser origin(s) for CORS, comma-separated (e.g. `http://localhost:5173`); dev localhost/127.0.0.1 origins are allowed automatically
- `SEED_ADMIN_EMAIL`: Initial admin email
- `SEED_ADMIN_PASSWORD`: Initial admin password

Fill in the values in `web/.env`:

- `VITE_SERVER_URL`: Base URL of the Express backend server (default: `http://localhost:3000`). API requests are sent directly via CORS.

> **💡 Dev Tip (Supabase Email Confirmation)**:
> In the Supabase dashboard (`Authentication > Providers > Email`), disable **"Confirm email"** during development so new user registrations log in immediately.

### 3. Run Database Migrations

Deploy the Prisma schema and baseline migration:

```bash
npm run db:migrate
```

### 4. Seed the Database

Populate initial admin user, chefs, ingredients, and dishes with recipe associations:

```bash
npm run db:seed
```

### 5. Start Development

Run the Express API and Vite dev server concurrently:

```bash
npm run dev
```

- **Vite React Frontend**: [http://localhost:5173](http://localhost:5173) (with fast Hot Module Replacement; connects directly to Express API via CORS with `VITE_SERVER_URL`)
- **Express API Server**: [http://localhost:3000](http://localhost:3000)

Alternatively, run services individually:

```bash
npm run dev:client  # Vite dev server on port 5173
npm run dev:server  # Express API server on port 3000 (tsx watch)
```

---

## 🧪 Testing & Code Quality

Run Vitest unit test suite (10 test suites, 60 test cases covering HTTP envelopes, Bearer token auth, CSRF bypass, business/technical error contracts, CORS, validation, rate limiting, and RBAC):

```bash
npm test
```

Run TypeScript type check:

```bash
npm run typecheck
```

Run ESLint check:

```bash
npm run lint
```

Build production bundle (Vite SPA client + TypeScript server):

```bash
npm run build
```

Start in production mode:

```bash
npm start
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.
