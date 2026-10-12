-- ============================================================
-- Team13 Restaurant — Baseline Migration
-- ============================================================

-- 1. Extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enums
CREATE TYPE "role" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');
CREATE TYPE "dish_category" AS ENUM ('appetizer', 'main', 'dessert', 'drink', 'combo');

-- 3. Profiles
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "role" NOT NULL DEFAULT 'CUSTOMER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "profiles_email_idx" ON "profiles"("email");
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- 4. Chefs
CREATE TABLE "chefs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "specialty" TEXT,
    "bio" TEXT,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chefs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chefs_experience_years_check" CHECK ("experience_years" >= 0)
);

-- 5. Ingredients
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'g',
    "stock_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "price_per_unit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ingredients_name_key" UNIQUE ("name"),
    CONSTRAINT "ingredients_stock_quantity_check" CHECK ("stock_quantity" >= 0),
    CONSTRAINT "ingredients_price_per_unit_check" CHECK ("price_per_unit" >= 0)
);

-- 6. Dishes
CREATE TABLE "dishes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "category" "dish_category" NOT NULL DEFAULT 'main',
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "prep_time_minutes" INTEGER,
    "chef_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dishes_slug_key" UNIQUE ("slug"),
    CONSTRAINT "dishes_price_check" CHECK ("price" >= 0),
    CONSTRAINT "dishes_prep_time_minutes_check" CHECK ("prep_time_minutes" > 0),
    CONSTRAINT "dishes_chef_id_fkey" FOREIGN KEY ("chef_id") REFERENCES "chefs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_dishes_chef" ON "dishes"("chef_id");
CREATE INDEX "idx_dishes_category" ON "dishes"("category");
CREATE INDEX "idx_dishes_available" ON "dishes"("is_available");

-- 7. Dish Ingredients (N-N)
CREATE TABLE "dish_ingredients" (
    "dish_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT DEFAULT 'g',

    CONSTRAINT "dish_ingredients_pkey" PRIMARY KEY ("dish_id","ingredient_id"),
    CONSTRAINT "dish_ingredients_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "dish_ingredients_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dish_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_dish_ingredients_ingredient" ON "dish_ingredients"("ingredient_id");

-- 8. Row Level Security (RLS)
ALTER TABLE "chefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dishes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dish_ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;

-- Public Read-Only Policies (Security fix: no write policies to prevent anon key tampering)
CREATE POLICY "public read chefs" ON "chefs" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read ingredients" ON "ingredients" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read dishes" ON "dishes" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read dish_ingredients" ON "dish_ingredients" FOR SELECT TO anon, authenticated USING (true);
