# Team13 Restaurant — React CSR & REST API Web Application

A modern client-side rendered (CSR) web application for restaurant meal management and public dining catalog, built with **React 19**, **Vite**, **React Router v7**, **Express 5 REST API**, **TypeScript**, **Tailwind CSS v4**, **Prisma ORM 7**, and **Supabase** (PostgreSQL, Auth, Storage).

---

## 🌟 Key Features

### 1. Public Dining Portal (`/`)

- **Homepage (`/`)**: Hero carousel, chef-highlighted dishes (`isFeatured`), and brand ticker.
- **Menu & Dish Catalog (`/dishes`)**: Category filter pills (`appetizer`, `main`, `dessert`, `drink`, `combo`), server-side keyword search via query parameter (`/dishes?q=...`), price/name sorting, and real-time **"Sold out"** badges.
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
- **Styling**: Tailwind CSS v4 (`public/css/app.css` and `public/css/style.css` with dynamic layout stylesheet isolation)
- **State & Context**:
  - `AuthContext`: Session bootstrap via `GET /api/auth/me`, login, and logout.
  - `FlashContext`: Non-intrusive floating toast notifications for user actions.
  - `ThemeContext`: Persistent light/dark mode switcher.
- **HTTP Client**: Typed wrapper `apiFetch<T>` with automatic CSRF token header (`x-csrf-token`) injection and standardized error unboxing.

### Backend (Decoupled REST API)

- **Runtime**: [Express 5](https://expressjs.com/) on Node.js (TypeScript, ES modules)
- **Database / ORM**: PostgreSQL via Supabase + [Prisma ORM 7](https://www.prisma.io/) with `@prisma/adapter-pg`
- **Authentication**: Supabase Auth (HTTP-only cookies via `@supabase/ssr` + lazy `Profile` sync)
- **Object Storage**: Supabase Storage (`images` bucket for meals, chefs, and ingredients)
- **Security**:
  - Double-submit CSRF protection (`csrf-csrf`) with token delivered via `/api/auth/me` and validated on mutation requests.
  - HTTP security headers (`helmet`).
  - Rate limiting with standardized `RATE_LIMITED` JSON error responses.
  - Request validation using [Zod](https://zod.dev/).
- **SPA Fallback**: Express serves `dist/client/index.html` for non-API client routes in production.

### Standardized JSON Response Shape

All REST API endpoints conform to a unified JSON contract:

- **Success (`2xx`)**:
  ```json
  {
    "ok": true,
    "data": { ... }
  }
  ```
- **Failure (`4xx` / `5xx`)**:
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

Common error codes include: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `FILE_TOO_LARGE`, `INTERNAL_ERROR`.

---

## 📡 REST API Overview

| Route                                |      Method      |    Access     | Description                                                          |
| ------------------------------------ | :--------------: | :-----------: | -------------------------------------------------------------------- |
| `/api/auth/me`                       |       GET        |    Public     | Current profile and CSRF token                                       |
| `/api/auth/login`                    |       POST       |    Public     | Sign in with email and password                                      |
| `/api/auth/register`                 |       POST       |    Public     | Register new account                                                 |
| `/api/auth/logout`                   |       POST       | Authenticated | Clear session cookies                                                |
| `/api/auth/callback`                 |     GET/POST     |    Public     | Supabase OAuth / email verification callback                         |
| `/api/home`                          |       GET        |    Public     | Featured dishes, stats, and promotional data                         |
| `/api/dishes`                        |       GET        |    Public     | Public dishes catalog with `?q=`, `?category=`, and `?sort=` filters |
| `/api/menu`                          |       GET        |    Public     | Paginated dish catalog with category & sort filters                  |
| `/api/dishes/:slug`                  |       GET        |    Public     | Detailed dish info by slug or UUID id, recipe ingredients, and chef  |
| `/api/admin/stats`                   |       GET        | Staff / Admin | Dashboard summary counts                                             |
| `/api/admin/dishes`                  |    GET, POST     | Staff / Admin | List dishes with filters; create new dish                            |
| `/api/admin/dishes/:id`              | GET, PUT, DELETE | Staff / Admin | View detail; update dish; soft delete dish                           |
| `/api/admin/dishes/:id/restore`      |       POST       | Staff / Admin | Restore soft-deleted dish                                            |
| `/api/admin/dishes/form-deps`        |       GET        | Staff / Admin | Active chefs and ingredients options for dish editor                 |
| `/api/admin/chefs`                   |    GET, POST     | Staff / Admin | List chefs; create new chef profile                                  |
| `/api/admin/chefs/:id`               | GET, PUT, DELETE | Staff / Admin | View, update, or soft-delete chef                                    |
| `/api/admin/chefs/:id/restore`       |       POST       | Staff / Admin | Restore soft-deleted chef                                            |
| `/api/admin/ingredients`             |    GET, POST     | Staff / Admin | List ingredients inventory; create new ingredient                    |
| `/api/admin/ingredients/:id`         | GET, PUT, DELETE | Staff / Admin | View, update, or soft-delete ingredient                              |
| `/api/admin/ingredients/:id/restore` |       POST       | Staff / Admin | Restore soft-deleted ingredient                                      |
| `/api/admin/users`                   |       GET        |  Admin only   | List registered users with pagination & search                       |
| `/api/admin/users/:id/role`          |   PATCH, POST    |  Admin only   | Change user role (`CUSTOMER`, `STAFF`, `ADMIN`)                      |

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

- `DATABASE_URL`: Supabase Transaction Pooler URL (port `6543`)
- `DIRECT_URL`: Supabase Session / Direct connection URL (port `5432`)
- `SUPABASE_URL`: Your Supabase project URL (`https://<project-ref>.supabase.co`)
- `SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key
- `SUPABASE_SECRET_KEY`: Supabase secret key (`service_role` for admin & storage bypass)
- `STORAGE_BUCKET`: `images` (auto-created by seed script if missing)
- `CSRF_SECRET`: 32+ character random string (e.g. `openssl rand -hex 32`)
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

Run all services concurrently (Express API + Vite Dev Server + Tailwind CSS watcher):

```bash
npm run dev
```

- **Vite React Frontend**: [http://localhost:5173](http://localhost:5173) (with fast Hot Module Replacement; connects directly to Express API via CORS with `VITE_SERVER_URL`)
- **Express API Server**: [http://localhost:3000](http://localhost:3000)

Alternatively, run services individually:

```bash
npm run dev:client  # Vite dev server on port 5173
npm run dev:server  # Express API server on port 3000 (tsx watch)
npm run dev:css     # Tailwind CSS compiler in watch mode
```

---

## 🧪 Testing & Code Quality

Run Vitest unit test suite (9 test suites, 45 test cases covering HTTP envelopes, business/technical error contracts, CORS, validation, rate limiting, and RBAC):

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

Build production bundle (Tailwind CSS + Vite SPA client + TypeScript server):

```bash
npm run build
```

Start in production mode:

```bash
npm start
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.
