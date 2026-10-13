# AI Usage Report — Team 13 Restaurant Project

- **Author**: Phan Bình Khang (Andy Khang)
- **Course**: Web Application Architecture — HCMUS (Y3 / S1)
- **Project**: Team 13 Restaurant SSR Web Application
- **AI Tool**: Antigravity (Google DeepMind Agentic AI Coding Assistant)
- **Date**: October 12, 2026

---

## 1. Executive Summary & Objective

This document chronicles the pair-programming and architectural collaboration between **Phan Bình Khang** and the **Antigravity AI Assistant** to build a modern, production-grade Server-Side Rendered (SSR) restaurant web application. 

The application connects to **Supabase** (PostgreSQL, Auth, Storage) via **Prisma ORM 7** and delivers two distinct interfaces:
1. **Public Dining Portal (`/`)**: Discover featured dishes, browse category-grouped dining menus with real-time availability badges, and inspect detailed meal recipes and chef profiles.
2. **Admin Operations Portal (`/admin`)**: Robust Role-Based Access Control (RBAC) enabling staff and administrators to manage meals, recipe proportions, kitchen inventory, chefs, and user permissions with strict security safeguards.

---

## 2. Phase 1: Architectural Alignment & "Grill-Me" Interview

Rather than generating uncoordinated code, the interaction began with a comprehensive requirements interview (`/grill-me`), mapping out the application as a **Design Tree** across 38 architectural decisions in 4 rounds.

### Round 1: Foundation & Stack (Q1 – Q9)
- **SSR Framework**: Express 5 paired with `express-handlebars` for explicit MVC structure.
- **Language**: TypeScript with strict mode and `NodeNext` ESM module resolution.
- **Authentication**: Supabase Auth (SSR cookie-based session bridge) combined with an application-level `profiles` table in PostgreSQL.
- **RBAC Strategy**: Code-level static permission map (`can(user, permission)`) driven by a role enum (`ADMIN`, `STAFF`, `CUSTOMER`).
- **Topology**: Unified application instance with distinct layout engines (`layouts/public.hbs` vs `layouts/admin.hbs`).
- **Media Storage**: Supabase Storage public bucket (`images`) with server-side validation and automated lifecycle management.
- **Styling**: Tailwind CSS v4 using the standalone `@tailwindcss/cli` build pipeline.

### Round 2: Data Models & UX Workflows (Q10 – Q20)
- **Role Differentiation**: `STAFF` can create, update, and delete dishes/chefs/ingredients; only `ADMIN` can manage user roles.
- **Bootstrap / Seeding**: Idempotent `prisma db seed` script creating the initial administrator via Supabase Admin Auth and populating sample menu data.
- **Soft Delete**: `deleted_at` timestamp column on `dishes`, `chefs`, and `ingredients`, paired with an admin toggle to view/restore deleted records.
- **List UX**: Server-side query-string pagination (`?page=&q=`) and name search, preserving active filters across page jumps.
- **Forms & Security**: Plain HTML forms with Zod validation, flash alerts via signed cookies, and double-submit CSRF protection (`csrf-csrf`).
- **Localization**: English interface with VND currency formatting (`Intl.NumberFormat('vi-VN')`).

### Round 3: Schema Auditing & Security Hardening (Q21 – Q30)
- **RLS Vulnerability Remediation**: Audited the existing `supabase/schema.sql`. Identified a critical flaw where default policies granted all authenticated users full write access to all tables. Hardened the policies by removing all public write rules (routing all writes through Express and Prisma) and locking down `profiles`.
- **Database Source of Truth**: Translated raw SQL into Prisma Schema migrations (`prisma/schema.prisma`).
- **Data Integrity**: Converted string categories to a native PostgreSQL enum (`dish_category`) and retained SQL check constraints.
- **SEO & URLs**: Automated Vietnamese diacritic removal for slugs (`Phở Bò` → `pho-bo`) with collision handling (`pho-bo-2`).

### Round 4: Environment & Safeguards (Q31 – Q38)
- **Configuration Contract**: Standardized `.env.example` with strict Zod startup validation.
- **Role Safeguards**: Prohibited administrators from modifying their own role, and programmatically blocked demoting the last remaining `ADMIN`.
- **Media Constraints**: Enforced 2 MB upload limits with magic-byte and MIME validation (JPEG, PNG, WebP).
- **Consolidated Plan**: Produced and user-approved [`design.md`](file:///home/pbkhang404/.gemini/antigravity/brain/cea0cf78-ea26-41fc-99e3-0cbedf03115e/design.md).

---

## 3. Phase 2: Implementation & Code Generation

### 3.1 Toolchain & Package Setup
- Configured [`package.json`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/package.json), [`tsconfig.json`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tsconfig.json), [`tsconfig.build.json`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tsconfig.build.json), [`eslint.config.js`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/eslint.config.js), and [`.prettierrc`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/.prettierrc).
- Installed core dependencies: `express`, `express-handlebars`, `@supabase/ssr`, `@supabase/supabase-js`, `@prisma/client@7.10.0`, `@prisma/adapter-pg`, `zod`, `csrf-csrf`, `cookie-parser`, `multer`, `dotenv`, `helmet`, `morgan`, `tailwindcss`, `@tailwindcss/cli`, `vitest`, `supertest`.

### 3.2 Core Services & Security Middleware
- [`src/config/env.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/config/env.ts): Startup validation for database URLs, keys, secrets, and ports.
- [`src/lib/slug.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/lib/slug.ts): Pure utility for diacritic-safe slugification.
- [`src/lib/storage.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/lib/storage.ts): Magic-byte validation, Supabase Storage uploads, transaction rollback on failure, and automatic orphan-image deletion.
- [`src/auth/permissions.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/permissions.ts): Centralized RBAC permission mapping.
- [`src/middleware/security.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/middleware/security.ts): Double-submit CSRF protection bound to a signed browser ID cookie (`sid`), global multipart parsing, and flash alerts.
- [`src/auth/middleware.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/auth/middleware.ts): Cookie session resolution via `getClaims()`, lazy Profile creation on first sign-in, `requireAuth`, and `requirePermission`.

### 3.3 Views & User Interfaces
- **Layouts & Partials**: Clean, responsive layout components with Tailwind CSS v4 ([`public.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/layouts/public.hbs), [`admin.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/layouts/admin.hbs), [`navbar.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/navbar.hbs), [`admin-nav.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/admin-nav.hbs), [`pagination.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/pagination.hbs), [`flash.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/partials/flash.hbs)).
- **Public Pages**:
  - [`home.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/public/home.hbs): Hero presentation and featured dishes grid.
  - [`menu.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/public/menu.hbs): Filterable category pill navigation with "Sold out" indicators.
  - [`dish.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/public/dish.hbs): Detailed dish recipe ingredients (names only) and Chef spotlight bio card.
- **Admin Pages**:
  - [`index.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/admin/index.hbs): Real-time metrics overview and quick actions.
  - [`dishes/form.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/admin/dishes/form.hbs): Dynamic multi-row recipe ingredient selector with custom quantities and units.
  - [`users/index.hbs`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/views/pages/admin/users/index.hbs): Role management with locked controls on self-profile and last-admin warning.
  - Full CRUD forms and tables for Chefs and Ingredients.

---

## 4. Phase 3: Iteration, Key Renaming & Database Debugging

### 4.1 Supabase Key Nomenclature
- **User Request**: Switched Supabase keys from `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`.
- **Changes Applied**: Updated [`.env.example`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/.env.example), [`src/config/env.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/config/env.ts), [`src/lib/supabase.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/src/lib/supabase.ts), [`prisma/seed.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/prisma/seed.ts), and [`tests/setup.ts`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/tests/setup.ts).

### 4.2 JWKS Architecture Advisory
- **User Question**: *"Is supabase currently using jwks and need jwks url?"*
- **Technical Explanation Provided**: Clarified that modern Supabase uses asymmetric JWT signing keys (ECC/Ed25519) publishing public keys at `/.well-known/jwks.json`. Demonstrated that `@supabase/ssr` / `@supabase/auth-js` fetches and caches these keys automatically via `SUPABASE_URL`, requiring no separate `JWKS_URL` configuration.

### 4.3 Database Schema Drift & Missing Column Fix
- **Issue Encountered**: Runtime error on `prisma.dish.findMany()` stating:
  ```
  The column `dishes.deleted_at` does not exist in the current database.
  ```
- **Root Cause Analysis**: The database had been initialized with the legacy `supabase/schema.sql` before migrations were deployed. When Prisma recorded `0_init` as an existing baseline (`applied_steps_count: 0`), new table alterations had not been executed on the live Supabase instance.
- **Resolution**:
  1. Generated migration [`20261012112000_add_missing_columns`](file:///home/pbkhang404/Documents/HCMUS/Y3/S1/web/team13-restaurant/prisma/migrations/20261012112000_add_missing_columns/migration.sql) adding `deleted_at` to `dishes`, `chefs`, and `ingredients`, casting `category` to `dish_category`, and creating the `profiles` table.
  2. Successfully deployed the migration via `npm run db:migrate`.
  3. Fixed a seed password constraint (enforcing minimum 6 characters required by Supabase Auth).
  4. Executed `npm run db:seed` to provision the admin account, storage bucket, and full sample menu.

---

## 5. Verification & Test Results

The application underwent multi-tier verification before completion:

```bash
# 1. Vitest Unit Suite
npm run test
# Output: 3 test files passed (9 tests passing in ~400ms)
# - tests/http.test.ts (Open redirect safety)
# - tests/slug.test.ts (Vietnamese slug generation & collision avoidance)
# - tests/permissions.test.ts (ADMIN, STAFF, CUSTOMER RBAC matrix)

# 2. TypeScript Strict Check
npm run typecheck
# Output: tsc --noEmit (0 errors)

# 3. Tailwind CSS & Server Compilation
npm run build
# Output:
# - tailwindcss v4.3.3 minify -> public/css/app.css (39 KB)
# - tsc -p tsconfig.build.json -> dist/ (Clean build)

# 4. Runtime Startup Verification
node dist/server.js
# Output:
# 🚀 Team13 Restaurant SSR server running at http://localhost:3000
# 📁 Environment: development
```

---

## 6. Personal Reflections & Learning Insights

1. **Systematic Upfront Design Prevents Rewrites**: The structured "grill-me" interview eliminated ambiguities around role permissions, image storage lifetimes, and routing boundaries before writing code.
2. **Security by Default**: Auditing existing SQL scripts uncovered permissive RLS policies early, ensuring anon users cannot manipulate database records through public REST APIs.
3. **Database Migration Discipline**: Encountering the `deleted_at` drift illustrated how ORM baseline migrations interact with pre-existing database tables, and highlighted the importance of declarative migration scripts.
4. **Effective AI Collaboration**: Using AI as an active pair programmer—asking critical design questions, enforcing type safety, and debugging environment differences—led to a cleaner, more robust codebase.
