-- ============================================================
-- Migration: Add CHECK constraints and RLS policies from Supabase
-- ============================================================

-- ------------------------------------------------------------
-- 1. CHECK CONSTRAINTS
-- ------------------------------------------------------------

-- Chefs: experience_years must be non-negative
ALTER TABLE "chefs" DROP CONSTRAINT IF EXISTS "chefs_experience_years_check";
ALTER TABLE "chefs" ADD CONSTRAINT "chefs_experience_years_check"
    CHECK ("experience_years" >= 0);

-- Ingredients: stock_quantity and price_per_unit must be non-negative
ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "ingredients_stock_quantity_check";
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_stock_quantity_check"
    CHECK ("stock_quantity" >= 0);

ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "ingredients_price_per_unit_check";
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_price_per_unit_check"
    CHECK ("price_per_unit" >= 0);

-- Dishes: price must be non-negative and prep_time_minutes must be positive
ALTER TABLE "dishes" DROP CONSTRAINT IF EXISTS "dishes_price_check";
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_price_check"
    CHECK ("price" >= 0);

ALTER TABLE "dishes" DROP CONSTRAINT IF EXISTS "dishes_prep_time_minutes_check";
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_prep_time_minutes_check"
    CHECK ("prep_time_minutes" IS NULL OR "prep_time_minutes" > 0);

-- Dish Ingredients: quantity must be positive
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
-- 3. RLS POLICIES - RESTAURANT CORE TABLES
-- ------------------------------------------------------------

-- Public read policies (User catalog)
DROP POLICY IF EXISTS "public read chefs" ON "chefs";
CREATE POLICY "public read chefs"
    ON "chefs" FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "public read ingredients" ON "ingredients";
CREATE POLICY "public read ingredients"
    ON "ingredients" FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "public read dishes" ON "dishes";
CREATE POLICY "public read dishes"
    ON "dishes" FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "public read dish_ingredients" ON "dish_ingredients";
CREATE POLICY "public read dish_ingredients"
    ON "dish_ingredients" FOR SELECT TO anon, authenticated
    USING (true);

-- Authenticated write policies (Admin / Staff CRUD)
DROP POLICY IF EXISTS "authenticated write chefs" ON "chefs";
CREATE POLICY "authenticated write chefs"
    ON "chefs" FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated write ingredients" ON "ingredients";
CREATE POLICY "authenticated write ingredients"
    ON "ingredients" FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated write dishes" ON "dishes";
CREATE POLICY "authenticated write dishes"
    ON "dishes" FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated write dish_ingredients" ON "dish_ingredients";
CREATE POLICY "authenticated write dish_ingredients"
    ON "dish_ingredients" FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- ------------------------------------------------------------
-- 4. RLS POLICIES - PROFILES TABLE
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "public read profiles" ON "profiles";
CREATE POLICY "public read profiles"
    ON "profiles" FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "users insert own profile" ON "profiles";
CREATE POLICY "users insert own profile"
    ON "profiles" FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users update own profile" ON "profiles";
CREATE POLICY "users update own profile"
    ON "profiles" FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------
-- 5. SUPABASE STORAGE (BUCKETS & POLICIES)
-- Applied conditionally when storage schema exists
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES
      ('dish-images', 'dish-images', true),
      ('chef-avatars', 'chef-avatars', true),
      ('ingredient-images', 'ingredient-images', true)
    ON CONFLICT (id) DO NOTHING;

    EXECUTE 'DROP POLICY IF EXISTS "public read images" ON storage.objects';
    EXECUTE 'CREATE POLICY "public read images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id IN (''dish-images'',''chef-avatars'',''ingredient-images''))';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated upload images" ON storage.objects';
    EXECUTE 'CREATE POLICY "authenticated upload images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN (''dish-images'',''chef-avatars'',''ingredient-images''))';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated update images" ON storage.objects';
    EXECUTE 'CREATE POLICY "authenticated update images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN (''dish-images'',''chef-avatars'',''ingredient-images''))';

    EXECUTE 'DROP POLICY IF EXISTS "authenticated delete images" ON storage.objects';
    EXECUTE 'CREATE POLICY "authenticated delete images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN (''dish-images'',''chef-avatars'',''ingredient-images''))';
  END IF;
END $$;
