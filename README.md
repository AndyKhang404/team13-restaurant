# Team13 Restaurant — SSR Web Application

An SSR web application for restaurant meal management and public dining catalog, built with **Express**, **Handlebars**, **TypeScript**, **Tailwind CSS v4**, **Prisma ORM 7**, and **Supabase** (PostgreSQL, Auth, Storage).

---

## 🌟 Key Features

### 1. Public Dining Portal (`/`)
- **Homepage (`/`)**: Hero showcase and chef-highlighted dishes (`is_featured`).
- **Full Menu (`/menu`)**: Grouped by category (`appetizer`, `main`, `dessert`, `drink`, `combo`), filterable with real-time category pills. Real-time **"Sold out"** badges when unavailable.
- **Dish Detail (`/dishes/:slug`)**: High-res imagery, prices in VND, prep time, ingredient list (names only, keeping stock and wholesale cost confidential), and creator Chef spotlight card.

### 2. Admin Operations Portal (`/admin`)
- **Dashboard (`/admin`)**: Real-time stats across active dishes, chefs, ingredients, and registered users.
- **Meal CRUD (`/admin/dishes`)**:
  - Full create/read/update/soft-delete/restore cycle.
  - Image upload to Supabase Storage with preview and delete capability.
  - Recipe proportioning: dynamic multi-row ingredient selector with custom quantities and units.
  - Automatic Vietnamese diacritic-stripped SEO slugs (`Phở Bò` → `pho-bo`), collision-safe (`pho-bo-2`).
- **Chefs Management (`/admin/chefs`)**: Manage chef profiles, specialties, biographies, and portrait uploads.
- **Ingredients Inventory (`/admin/ingredients`)**: Track inventory quantities, units (`g`, `kg`, `ml`), unit costs, and availability.
- **User Role Management (`/admin/users`)**: Exclusively available to `ADMIN`. Role alteration with safety locks preventing self-demotion and ensuring the last remaining `ADMIN` is preserved.

### 3. Role-Based Access Control (RBAC)
| Capability | ADMIN | STAFF | CUSTOMER | Guest |
|---|:---:|:---:|:---:|:---:|
| Browse Menu & View Meal Details | ✅ | ✅ | ✅ | ✅ |
| Access Admin Dashboard (`/admin`) | ✅ | ✅ | ❌ | ❌ |
| Create, Edit, Soft-delete Meals & Recipes | ✅ | ✅ | ❌ | ❌ |
| Manage Chefs & Ingredients Inventory | ✅ | ✅ | ❌ | ❌ |
| Change User Roles (`user:manage`) | ✅ | ❌ | ❌ | ❌ |

---

## 🛠️ Tech Stack & Architecture

- **Backend / SSR**: Express 5 + Handlebars (`express-handlebars`)
- **Styling**: Tailwind CSS v4 CLI compilation (`public/css/app.css`)
- **Language**: TypeScript (strict mode, NodeNext modules)
- **Database / ORM**: PostgreSQL via Supabase + Prisma ORM 7 (`@prisma/adapter-pg`)
- **Authentication**: Supabase Auth (SSR cookie session bridge + lazy Profile sync)
- **Object Storage**: Supabase Storage (`images` bucket for meals, chefs, and ingredients)
- **Security**: Double-submit CSRF protection (`csrf-csrf`), HTTP security headers (`helmet`), Zod validation schemas
- **Testing**: Vitest unit test suite

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20 or higher (v22 / v24 LTS recommended)
- **npm**: v10 or higher
- A **Supabase** project (free tier)

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in the values in `.env`:
- `DATABASE_URL`: Supabase Transaction Pooler URL (port `6543`)
- `DIRECT_URL`: Supabase Session / Direct connection URL (port `5432`)
- `SUPABASE_URL`: Your Supabase project URL (`https://<project-ref>.supabase.co`)
- `SUPABASE_ANON_KEY`: Supabase anon public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service_role secret key (kept server-side)
- `STORAGE_BUCKET`: `images` (auto-created by seed script if missing)
- `CSRF_SECRET`: 32+ character random string (e.g. `openssl rand -hex 32`)
- `SEED_ADMIN_EMAIL`: Initial admin email
- `SEED_ADMIN_PASSWORD`: Initial admin password

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

### 5. Start Development Server
Runs the Express server with live reload (`tsx watch`) and the Tailwind CSS compiler in watch mode:
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Testing & Code Quality

Run the test suite:
```bash
npm run test
```

Run TypeScript type check:
```bash
npm run typecheck
```

Build production bundle:
```bash
npm run build
```
Run in production mode:
```bash
npm start
```
