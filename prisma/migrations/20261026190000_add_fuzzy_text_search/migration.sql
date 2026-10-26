-- ============================================================
-- Migration: Add pg_trgm extension and GIN trigram indexes for fuzzy text search
-- ============================================================

-- 1. Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Create GIN trigram indexes for fast fuzzy matching & ILIKE
CREATE INDEX IF NOT EXISTS "idx_dishes_name_trgm"
  ON "dishes" USING GIN (public.f_unaccent("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_dishes_desc_trgm"
  ON "dishes" USING GIN (public.f_unaccent(coalesce("description", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_chefs_name_trgm"
  ON "chefs" USING GIN (public.f_unaccent("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_chefs_specialty_trgm"
  ON "chefs" USING GIN (public.f_unaccent(coalesce("specialty", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_chefs_bio_trgm"
  ON "chefs" USING GIN (public.f_unaccent(coalesce("bio", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_ingredients_name_trgm"
  ON "ingredients" USING GIN (public.f_unaccent("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_profiles_name_trgm"
  ON "profiles" USING GIN (public.f_unaccent(coalesce("display_name", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_profiles_email_trgm"
  ON "profiles" USING GIN (lower("email") gin_trgm_ops);
