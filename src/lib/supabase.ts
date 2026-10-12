import type { Request, Response } from 'express';
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env, isProd } from '../config/env.js';

/**
 * Per-request Supabase client for auth (anon key + user's cookies).
 * Reads cookies from the request, writes refreshed session cookies to the response.
 */
export function createSupabaseForRequest(req: Request, res: Response) {
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions: { sameSite: 'lax', secure: isProd, path: '/', httpOnly: true },
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie ?? '');
      },
      setAll(cookiesToSet, headers) {
        if (res.headersSent) return;
        for (const { name, value, options } of cookiesToSet) {
          res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, options));
        }
        for (const [key, value] of Object.entries(headers ?? {})) res.setHeader(key, value);
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. Server-only: storage uploads and seeding.
 * Never pass this client (or its key) to views.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** True if the request carries any Supabase auth cookie (skip auth round-trips for anonymous visitors). */
export function hasAuthCookie(req: Request): boolean {
  const header = req.headers.cookie ?? '';
  return /(?:^|;\s*)sb-[^=]+-auth-token/.test(header);
}
