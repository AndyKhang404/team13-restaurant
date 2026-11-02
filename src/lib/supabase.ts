import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Secret client (service_role) — bypasses RLS. Server-only: storage uploads and
 * seeding. Authentication is handled locally in `src/auth`.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
