import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { createSupabaseForRequest, hasAuthCookie } from '../lib/supabase.js';
import { forbidden, unauthorized } from '../lib/http.js';
import { can, type Permission } from './permissions.js';

/**
 * Resolves the Supabase session (verifying the JWT) and loads/creates the app Profile.
 * Anonymous requests skip the auth round-trip entirely.
 */
export const loadUser: RequestHandler = async (req, res, next) => {
  req.user = null;
  if (hasAuthCookie(req)) {
    const supabase = createSupabaseForRequest(req, res);
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!error && claims?.sub) {
      const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
      req.user =
        (await prisma.profile.findUnique({ where: { id: claims.sub } })) ??
        // Lazy creation on first login; role defaults to CUSTOMER.
        (await prisma.profile.upsert({
          where: { id: claims.sub },
          create: {
            id: claims.sub,
            email: typeof claims.email === 'string' ? claims.email : '',
            displayName: typeof meta.display_name === 'string' ? meta.display_name : null,
          },
          update: {},
        }));
    }
  }
  res.locals.user = req.user;
  next();
};

/** Rejects anonymous users with 401 UNAUTHORIZED HttpError. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (req.user) return next();
  next(unauthorized());
};

/** Requires a signed-in user holding `permission`; otherwise 401 or 403. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!can(req.user, permission)) return next(forbidden());
    next();
  };
}

