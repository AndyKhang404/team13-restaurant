-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('PENDING', 'ACTIVE');

-- AlterEnum: CUSTOMER -> VIEWER (Block 8 default role)
BEGIN;
ALTER TABLE "public"."profiles" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."profiles" ALTER COLUMN "role" TYPE TEXT USING ("role"::text);
UPDATE "public"."profiles" SET "role" = 'VIEWER' WHERE "role" = 'CUSTOMER';
CREATE TYPE "role_new" AS ENUM ('VIEWER', 'STAFF', 'ADMIN');
ALTER TABLE "public"."profiles" ALTER COLUMN "role" TYPE "role_new" USING ("role"::"role_new");
ALTER TYPE "public"."role" RENAME TO "role_old";
ALTER TYPE "public"."role_new" RENAME TO "role";
DROP TYPE "public"."role_old";
ALTER TABLE "public"."profiles" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
COMMIT;

-- AlterTable
ALTER TABLE "profiles"
ADD COLUMN "email_normalized" TEXT,
ADD COLUMN "email_verified_at" TIMESTAMPTZ(6),
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "status" "account_status" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Existing Supabase Auth users were already email-confirmed; keep them usable
-- while they set a local password through the reset flow.
UPDATE "profiles"
SET "email_normalized" = lower(btrim("email")),
    "status" = 'ACTIVE',
    "email_verified_at" = COALESCE("email_verified_at", "created_at", now());

ALTER TABLE "profiles" ALTER COLUMN "email_normalized" SET NOT NULL;

-- CreateTable
CREATE TABLE "activation_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'activation',
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "send_window_start" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sid_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activation_challenges_user_id_key" ON "activation_challenges"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sid_hash_key" ON "sessions"("sid_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_normalized_key" ON "profiles"("email_normalized");

-- AddForeignKey
ALTER TABLE "activation_challenges" ADD CONSTRAINT "activation_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
