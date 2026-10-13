-- ============================================================
-- Migration: Add CHECK constraints and Hardened RLS policies
-- ============================================================

-- ------------------------------------------------------------
-- 1. CHECK CONSTRAINTS
-- ------------------------------------------------------------
ALTER TABLE "chefs" DROP CONSTRAINT IF EXISTS "chefs_experience_years_check";
ALTER TABLE "chefs" ADD CONSTRAINT "chefs_experience_years_check"
    CHECK ("experience_years" >= 0);

ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "ingredients_stock_quantity_check";
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_stock_quantity_check"
    CHECK ("stock_quantity" >= 0);

ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "ingredients_price_per_unit_check";
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_price_per_unit_check"
    CHECK ("price_per_unit" >= 0);

ALTER TABLE "dishes" DROP CONSTRAINT IF EXISTS "dishes_price_check";
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_price_check"
    CHECK ("price" >= 0);

ALTER TABLE "dishes" DROP CONSTRAINT IF EXISTS "dishes_prep_time_minutes_check";
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_prep_time_minutes_check"
    CHECK ("prep_time_minutes" IS NULL OR "prep_time_minutes" > 0);

ALTER TABLE "dish_ingredients" DROP CONSTRAINT IF EXISTS "dish_ingredients_quantity_check";
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_quantity_check"
    CHECK ("quantity" > 0);

-- ------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY
-- ------------------------------------------------------------
ALTER TABLE "chefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dishes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dish_ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. CORE TABLES - PUBLIC READ (EXCLUDING SOFT-DELETED)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "public read chefs" ON "chefs";
CREATE POLICY "public read chefs"
    ON "chefs" FOR SELECT TO anon, authenticated
    USING ("deleted_at" IS NULL);

DROP POLICY IF EXISTS "public read ingredients" ON "ingredients";
CREATE POLICY "public read ingredients"
    ON "ingredients" FOR SELECT TO anon, authenticated
    USING ("deleted_at" IS NULL);

DROP POLICY IF EXISTS "public read dishes" ON "dishes";
CREATE POLICY "public read dishes"
    ON "dishes" FOR SELECT TO anon, authenticated
    USING ("deleted_at" IS NULL);

DROP POLICY IF EXISTS "public read dish_ingredients" ON "dish_ingredients";
CREATE POLICY "public read dish_ingredients"
    ON "dish_ingredients" FOR SELECT TO anon, authenticated
    USING (true);

-- Drop all client write policies (Prisma server handles mutations)
DROP POLICY IF EXISTS "authenticated write chefs" ON "chefs";
DROP POLICY IF EXISTS "authenticated write ingredients" ON "ingredients";
DROP POLICY IF EXISTS "authenticated write dishes" ON "dishes";
DROP POLICY IF EXISTS "authenticated write dish_ingredients" ON "dish_ingredients";

-- ------------------------------------------------------------
-- 4. PROFILES - RESTRICT TO OWN PROFILE READ ONLY
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "public read profiles" ON "profiles";
DROP POLICY IF EXISTS "users read own profile" ON "profiles";
CREATE POLICY "users read own profile"
    ON "profiles" FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- ------------------------------------------------------------
-- 5. STORAGE - PUBLIC READ ONLY (UPLOADS VIA SERVER ONLY)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES
      ('dish-images', 'dish-images', true),
      ('chef-avatars', 'chef-avatars', true),
      ('ingredient-images', 'ingredient-images', true)
    ON CONFLICT (id) DO NOTHING;

    -- Public read
    EXECUTE 'DROP POLICY IF EXISTS "public read images" ON storage.objects';
    EXECUTE 'CREATE POLICY "public read images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id IN (''dish-images'',''chef-avatars'',''ingredient-images''))';

    -- Drop client write policies (server uploads using service_role)
    EXECUTE 'DROP POLICY IF EXISTS "authenticated upload images" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated update images" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated delete images" ON storage.objects';
  END IF;
END $$;