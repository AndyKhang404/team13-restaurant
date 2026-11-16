-- App-level single-use MFA recovery codes. Only SHA-256 digests are stored.
CREATE TABLE "mfa_recovery_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mfa_recovery_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mfa_recovery_codes_user_id_code_hash_key"
  ON "mfa_recovery_codes"("user_id", "code_hash");

CREATE INDEX "mfa_recovery_codes_user_id_idx"
  ON "mfa_recovery_codes"("user_id");

ALTER TABLE "mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;
-- No policies: only the Prisma/service role may read or write.
