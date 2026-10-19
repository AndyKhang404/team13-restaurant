import type { Request, Response } from 'express';
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env, isProd } from '../config/env.js';

/**
 * Extract Bearer token from Authorization header if present.
 */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Per-request Supabase client for auth (publishable key + user's Bearer token or cookies).
 * Reads Bearer token from header or cookies from the request, writes refreshed session cookies to the response.
 */
export function createSupabaseForRequest(req: Request, res: Response) {
  const token = getBearerToken(req);
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
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
 * Secret client (service_role) — bypasses RLS. Server-only: storage uploads and seeding.
 * Never pass this client (or its key) to views.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** True if the request carries any Supabase auth cookie (skip auth round-trips for anonymous visitors). */
export function hasAuthCookie(req: Request): boolean {
  const header = req.headers.cookie ?? '';
  return /(?:^|;\s*)sb-[^=]+-auth-token/.test(header);
}

