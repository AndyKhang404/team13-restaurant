-- ============================================================
-- Migration: Add PostgreSQL Full-Text Search (unaccent + generated tsvector + GIN indexes)
-- ============================================================

-- 1. Enable unaccent extension
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Immutable unaccent wrapper that also folds Vietnamese đ/Đ -> d/D
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE PARALLEL SAFE STRICT
  SET search_path = public, extensions
AS $func$
BEGIN
  RETURN translate(unaccent($1), 'đĐ', 'dD');
END;
$func$;

-- 3. Generated tsvector columns & GIN indexes
ALTER TABLE "dishes" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "dishes"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("name", ''))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("description", ''))), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS "idx_dishes_search_vector" ON "dishes" USING GIN ("search_vector");

ALTER TABLE "chefs" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "chefs"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("name", ''))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("specialty", ''))), 'B') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("bio", ''))), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS "idx_chefs_search_vector" ON "chefs" USING GIN ("search_vector");

ALTER TABLE "ingredients" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "ingredients"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("name", ''))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("unit", ''))), 'D')
  ) STORED;
CREATE INDEX IF NOT EXISTS "idx_ingredients_search_vector" ON "ingredients" USING GIN ("search_vector");

ALTER TABLE "profiles" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "profiles"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("email", ''))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce("display_name", ''))), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS "idx_profiles_search_vector" ON "profiles" USING GIN ("search_vector");
