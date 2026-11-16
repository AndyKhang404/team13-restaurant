import type { Request, RequestHandler } from 'express';
import { ProfileStatus } from '../generated/prisma/enums.js';
import type { Profile } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { createSupabaseForRequest, getBearerToken, hasAuthCookie } from '../lib/supabase.js';
import { sendError } from '../lib/http.js';
import { type Permission } from './permissions.js';
import { ACCOUNT_SUSPENDED_MESSAGE, authorize, type Resource } from './policy.js';
import { isTokenRevoked } from './token-revocation.js';

interface JwtPayloadSummary {
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
}

function parseJwtPayload(token: string): JwtPayloadSummary | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const jsonStr = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(jsonStr) as JwtPayloadSummary;
  } catch {
    return null;
  }
}

async function loadOrCreateProfile(
  userId: string,
  email?: string,
  displayName?: string,
): Promise<Profile> {
  return (
    (await prisma.profile.findUnique({ where: { id: userId } })) ??
    // Lazy creation on first login; role defaults to VIEWER, status defaults to ACTIVE.
    (await prisma.profile.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: email ?? '',
        displayName: displayName ?? null,
      },
      update: {},
    }))
  );
}

function applyProfileToRequest(req: Request, profile: Profile): void {
  if (profile.status === ProfileStatus.SUSPENDED) {
    req.suspended = true;
    req.user = null;
    return;
  }
  req.user = profile;
}

function sendUnauthenticatedOrSuspended(req: Request, res: Parameters<RequestHandler>[1]) {
  if (req.suspended) {
    return sendError(res, 403, 'ACCOUNT_SUSPENDED', ACCOUNT_SUSPENDED_MESSAGE);
  }
  if (req.tokenExpired) {
    return sendError(res, 401, 'TOKEN_EXPIRED', 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
  }
  if (req.tokenRevoked) {
    return sendError(
      res,
      401,
      'UNAUTHENTICATED',
      'Token đã bị thu hồi do mật khẩu thay đổi. Vui lòng đăng nhập lại.',
    );
  }
  return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
}

/**
 * Resolves the Supabase session (verifying JWT from Bearer header or auth cookie)
 * and loads/creates the app Profile.
 * Suspended profiles leave `req.user = null` and set `req.suspended = true`.
 * Anonymous requests skip the auth round-trip entirely.
 */
export const loadUser: RequestHandler = async (req, res, next) => {
  req.user = null;
  req.tokenExpired = false;
  req.tokenRevoked = false;
  req.suspended = false;

  const token = getBearerToken(req);

  if (token) {
    try {
      const payload = parseJwtPayload(token);
      const nowSec = Math.floor(Date.now() / 1000);

      // Explicitly detect expired token by exp claim
      if (payload?.exp && payload.exp < nowSec) {
        req.tokenExpired = true;
        return next();
      }

      const supabase = createSupabaseForRequest(req, res);
      let userId: string | undefined;
      let email: string | undefined;
      let displayName: string | undefined;
      let tokenIat = payload?.iat;

      // Fast path: verify JWT claims without an extra /auth/v1/user network round-trip
      const claimsRes = await supabase.auth.getClaims(token);
      if (!claimsRes.error && claimsRes.data?.claims?.sub) {
        userId = claimsRes.data.claims.sub;
        tokenIat = claimsRes.data.claims.iat ?? tokenIat;
        email =
          typeof claimsRes.data.claims.email === 'string'
            ? claimsRes.data.claims.email
            : undefined;
        const meta = (claimsRes.data.claims.user_metadata ?? {}) as Record<string, unknown>;
        displayName = typeof meta.display_name === 'string' ? meta.display_name : undefined;
      } else {
        if (claimsRes.error?.message?.toLowerCase().includes('expir')) {
          req.tokenExpired = true;
        } else {
          // Fallback to remote getUser(token) if getClaims could not verify
          const { data, error } = await supabase.auth.getUser(token);
          if (!error && data?.user?.id) {
            userId = data.user.id;
            email = data.user.email;
            displayName = data.user.user_metadata?.display_name as string | undefined;
          } else if (error?.message?.toLowerCase().includes('expir')) {
            req.tokenExpired = true;
          }
        }
      }

      if (userId) {
        // Check if token was revoked prior to expiry (e.g. password reset or suspension)
        if (isTokenRevoked(userId, tokenIat)) {
          let isSuspended = false;
          try {
            const existing = await prisma.profile.findUnique({
              where: { id: userId },
              select: { status: true },
            });
            isSuspended = existing?.status === ProfileStatus.SUSPENDED;
          } catch {
            isSuspended = false;
          }
          if (isSuspended) {
            req.suspended = true;
          } else {
            req.tokenRevoked = true;
          }
        } else {
          const profile = await loadOrCreateProfile(userId, email, displayName);
          applyProfileToRequest(req, profile);
        }
      }
    } catch {
      // Ignored: invalid token leaves req.user = null
    }
  } else if (hasAuthCookie(req)) {
    try {
      const supabase = createSupabaseForRequest(req, res);
      const { data, error } = await supabase.auth.getClaims();
      const claims = data?.claims;
      if (!error && claims?.sub) {
        const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
        const profile = await loadOrCreateProfile(
          claims.sub,
          typeof claims.email === 'string' ? claims.email : '',
          typeof meta.display_name === 'string' ? meta.display_name : undefined,
        );
        applyProfileToRequest(req, profile);
      }
    } catch {
      // Ignored: invalid cookie leaves req.user = null
    }
  }

  res.locals.user = req.user;
  next();
};

/** Rejects suspended accounts with 403 ACCOUNT_SUSPENDED and anonymous/invalid users with 401. */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.user) {
    if (req.user.status === ProfileStatus.SUSPENDED) {
      return sendError(res, 403, 'ACCOUNT_SUSPENDED', ACCOUNT_SUSPENDED_MESSAGE);
    }
    return next();
  }
  return sendUnauthenticatedOrSuspended(req, res);
};

/**
 * Enforces route-level RBAC + account-status ABAC:
 * - 403 ACCOUNT_SUSPENDED if profile is suspended.
 * - 401 UNAUTHENTICATED / TOKEN_EXPIRED if no valid user session.
 * - 403 FORBIDDEN if authenticated user lacks the required permission.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthenticatedOrSuspended(req, res);
    }
    const denial = authorize(req.user, permission);
    if (denial) {
      return sendError(res, 403, denial.code, denial.message);
    }
    next();
  };
}

export type OwnershipResourceLoader = (req: Request) => Promise<Resource | null>;

/**
 * Enforces resource-level ABAC ownership after `requirePermission`.
 * If `loader(req)` returns `null`, falls through so the route handler emits 404.
 */
export function requireOwnership(
  action: Permission,
  loader: OwnershipResourceLoader,
): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) {
      return sendUnauthenticatedOrSuspended(req, res);
    }
    const resource = await loader(req);
    if (!resource) {
      return next();
    }
    const denial = authorize(req.user, action, resource);
    if (denial) {
      return sendError(res, 403, denial.code, denial.message);
    }
    next();
  };
}
