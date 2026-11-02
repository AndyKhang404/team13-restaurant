-- These tables are only accessed by the Prisma server connection (postgres
-- role). Enable RLS and remove client-role grants so anon/authenticated keys
-- cannot read session ids, OTP hashes, or reset token hashes.

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activation_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_resets" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "sessions" FROM anon, authenticated;
REVOKE ALL ON TABLE "activation_challenges" FROM anon, authenticated;
REVOKE ALL ON TABLE "password_resets" FROM anon, authenticated;