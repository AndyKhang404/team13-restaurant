-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "dish_category" AS ENUM ('appetizer', 'main', 'dessert', 'drink', 'combo');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "role" NOT NULL DEFAULT 'CUSTOMER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'g',
    "stock_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "price_per_unit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dish_ingredients" (
    "dish_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT DEFAULT 'g',

    CONSTRAINT "dish_ingredients_pkey" PRIMARY KEY ("dish_id","ingredient_id")
);

-- CreateIndex
CREATE INDEX "profiles_email_idx" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dishes_slug_key" ON "dishes"("slug");

-- CreateIndex
CREATE INDEX "idx_dishes_chef" ON "dishes"("chef_id");

-- CreateIndex
CREATE INDEX "idx_dishes_category" ON "dishes"("category");

-- CreateIndex
CREATE INDEX "idx_dishes_available" ON "dishes"("is_available");

-- CreateIndex
CREATE INDEX "idx_dish_ingredients_ingredient" ON "dish_ingredients"("ingredient_id");

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_chef_id_fkey" FOREIGN KEY ("chef_id") REFERENCES "chefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

