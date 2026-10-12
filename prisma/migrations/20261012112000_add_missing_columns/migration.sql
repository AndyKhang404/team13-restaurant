-- ============================================================
-- Migration: Add missing columns (deleted_at, profiles, enums)
-- ============================================================

-- 1. Create Enums if they do not exist yet
DO $$ BEGIN
  CREATE TYPE "role" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "dish_category" AS ENUM ('appetizer', 'main', 'dessert', 'drink', 'combo');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add deleted_at columns for soft-delete support
ALTER TABLE "chefs" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "dishes" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);

-- 3. Safely cast category to dish_category enum
DO $$ BEGIN
  ALTER TABLE "dishes" ALTER COLUMN "category" DROP DEFAULT;
  ALTER TABLE "dishes" ALTER COLUMN "category" TYPE "dish_category" USING "category"::"dish_category";
  ALTER TABLE "dishes" ALTER COLUMN "category" SET DEFAULT 'main'::"dish_category";
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 4. Create profiles table if not exists
CREATE TABLE IF NOT EXISTS "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "role" NOT NULL DEFAULT 'CUSTOMER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "profiles_email_idx" ON "profiles"("email");
CREATE INDEX IF NOT EXISTS "profiles_role_idx" ON "profiles"("role");

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
