-- App-side MFA status mirror for Supabase Auth TOTP factors.
-- Secrets stay in auth.mfa_factors; this table only tracks enablement,
-- the active factor id, recovery-code availability and lockout counters.
CREATE TABLE "mfa_states" (
  "user_id" UUID NOT NULL,
  "factor_id" TEXT,
  "enabled_at" TIMESTAMPTZ(6),
  "recovery_codes_enabled" BOOLEAN NOT NULL DEFAULT false,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_states_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "mfa_states_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Only the Prisma/service role touches this table. Enable RLS with no
-- policies so anon/authenticated Supabase clients cannot read lockout state.
ALTER TABLE "mfa_states" ENABLE ROW LEVEL SECURITY;
