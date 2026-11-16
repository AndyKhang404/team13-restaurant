-- The shared database already typed profiles.status as account_status
-- (PENDING/ACTIVE) from the local-auth branch. Align the app with that type
-- instead of changing the column type, and add the SUSPENDED value used by
-- the ABAC status feature.
ALTER TYPE "account_status" ADD VALUE IF NOT EXISTS 'SUSPENDED';
