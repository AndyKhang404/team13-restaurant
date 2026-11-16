-- ABAC attributes: profile account status and content ownership (created_by)
CREATE TYPE "profile_status" AS ENUM ('ACTIVE', 'SUSPENDED');
ALTER TABLE "profiles" ADD COLUMN "status" "profile_status" NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX "idx_profiles_status" ON "profiles"("status");

ALTER TABLE "dishes"      ADD COLUMN "created_by" UUID REFERENCES "profiles"("id") ON DELETE SET NULL;
ALTER TABLE "chefs"       ADD COLUMN "created_by" UUID REFERENCES "profiles"("id") ON DELETE SET NULL;
ALTER TABLE "ingredients" ADD COLUMN "created_by" UUID REFERENCES "profiles"("id") ON DELETE SET NULL;
CREATE INDEX "idx_dishes_created_by"      ON "dishes"("created_by");
CREATE INDEX "idx_chefs_created_by"       ON "chefs"("created_by");
CREATE INDEX "idx_ingredients_created_by" ON "ingredients"("created_by");
