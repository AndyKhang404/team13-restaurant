-- RFC 6238 §5.2: a TOTP code that already succeeded must not be accepted a
-- second time. Store only a SHA-256 digest of the last accepted code.
ALTER TABLE "mfa_states" ADD COLUMN "last_code_hash" TEXT;
ALTER TABLE "mfa_states" ADD COLUMN "last_code_at" TIMESTAMPTZ(6);
