import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { createSupabaseForRequest, getBearerToken, hasAuthCookie } from '../lib/supabase.js';
import { sendError } from '../lib/http.js';
import type { Permission } from './permissions.js';
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

/**
 * Resolves the Supabase session (verifying JWT from Bearer header or auth cookie)
 * and loads/creates the app Profile.
 * Anonymous requests skip the auth round-trip entirely.
 */
export const loadUser: RequestHandler = async (req, res, next) => {
  req.user = null;
  req.tokenExpired = false;
  req.tokenRevoked = false;

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
          // Check if token was revoked prior to expiry (e.g. user reset password)
          if (isTokenRevoked(userId, tokenIat)) {
            req.tokenRevoked = true;
          } else {
            req.user =
              (await prisma.profile.findUnique({ where: { id: userId } })) ??
              // Lazy creation on first login; role defaults to VIEWER.
              (await prisma.profile.upsert({
                where: { id: userId },
                create: {
                  id: userId,
                  email: email ?? '',
                  displayName: displayName ?? null,
                },
                update: {},
              }));
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
        req.user =
          (await prisma.profile.findUnique({ where: { id: claims.sub } })) ??
          // Lazy creation on first login; role defaults to VIEWER.
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
    } catch {
      // Ignored: invalid cookie leaves req.user = null
    }
  }

  res.locals.user = req.user;
  next();
};

/** Rejects anonymous or invalid users with 401 UNAUTHENTICATED or TOKEN_EXPIRED. */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.user) return next();
  if (req.tokenExpired) {
    return sendError(res, 401, 'TOKEN_EXPIRED', 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
  }
  if (req.tokenRevoked) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Token đã bị thu hồi do mật khẩu thay đổi. Vui lòng đăng nhập lại.');
  }
  return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
};

/**
 * Slide 30: "Mọi tài khoản đã kích hoạt dùng được CRUD; role chưa dùng để phân quyền ở bài này"
 * Checks authentication for protected endpoints.
 */
export function requirePermission(_permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      if (req.tokenExpired) {
        return sendError(res, 401, 'TOKEN_EXPIRED', 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      }
      return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
    }
    next();
  };
}
