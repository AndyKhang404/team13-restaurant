import type { Request, RequestHandler, Response } from 'express';
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
  aal?: string;
}

interface ProfileWithMfa {
  profile: NonNullable<Awaited<ReturnType<typeof prisma.profile.findUnique>>>;
  mfaEnabled: boolean;
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
 * Loads/creates the app Profile and the non-secret MFA status in a single
 * round-trip. `mfaState` is stripped so it never leaks through `req.user`.
 */
async function loadProfile(
  userId: string,
  email: string,
  displayName: string | null,
): Promise<ProfileWithMfa> {
  const existing = await prisma.profile.findUnique({
    where: { id: userId },
    include: { mfaState: { select: { enabledAt: true } } },
  });

  if (existing) {
    const { mfaState, ...profile } = existing;
    return { profile, mfaEnabled: Boolean(mfaState?.enabledAt) };
  }

  // Lazy creation on first login; role defaults to VIEWER.
  const created = await prisma.profile.upsert({
    where: { id: userId },
    create: { id: userId, email, displayName },
    update: {},
  });
  return { profile: created, mfaEnabled: false };
}

/**
 * Attaches the profile only when the token's AAL satisfies the user's MFA
 * policy. AAL1 tokens for MFA-enabled users are rejected by requireAuth.
 */
async function attachUser(
  req: Request,
  res: Response,
  userId: string,
  email: string,
  displayName: string | null,
  aal: string | undefined,
): Promise<void> {
  const { profile, mfaEnabled } = await loadProfile(userId, email, displayName);
  res.locals.mfaEnabled = mfaEnabled;

  if (mfaEnabled && aal !== 'aal2') {
    req.mfaRequired = true;
    req.user = null;
    return;
  }

  req.user = profile;
  res.locals.user = profile;
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
  req.mfaRequired = false;
  res.locals.mfaEnabled = false;

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
      let aal = payload?.aal;

      // Fast path: verify JWT claims without an extra /auth/v1/user network round-trip
      const claimsRes = await supabase.auth.getClaims(token);
      if (!claimsRes.error && claimsRes.data?.claims?.sub) {
        const claims = claimsRes.data.claims as {
          sub?: string;
          iat?: number;
          email?: string;
          aal?: string;
          user_metadata?: Record<string, unknown>;
        };
        userId = claims.sub;
        tokenIat = claims.iat ?? tokenIat;
        aal = claims.aal ?? aal;
        email = typeof claims.email === 'string' ? claims.email : undefined;
        const meta = claims.user_metadata ?? {};
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
          await attachUser(req, res, userId, email ?? '', displayName ?? null, aal);
        }
      }
    } catch {
      // Ignored: invalid token leaves req.user = null
    }
  } else if (hasAuthCookie(req)) {
    try {
      const supabase = createSupabaseForRequest(req, res);
      const { data, error } = await supabase.auth.getClaims();
      const claims = data?.claims as
        | {
            sub?: string;
            email?: string;
            aal?: string;
            user_metadata?: Record<string, unknown>;
          }
        | undefined;
      if (!error && claims?.sub) {
        const meta = claims.user_metadata ?? {};
        await attachUser(
          req,
          res,
          claims.sub,
          typeof claims.email === 'string' ? claims.email : '',
          typeof meta.display_name === 'string' ? meta.display_name : null,
          claims.aal,
        );
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
  if (req.mfaRequired) {
    return sendError(
      res,
      401,
      'MFA_REQUIRED',
      'Vui lòng xác thực hai lớp để tiếp tục.',
    );
  }
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
    if (req.user) return next();
    if (req.mfaRequired) {
      return sendError(
        res,
        401,
        'MFA_REQUIRED',
        'Vui lòng xác thực hai lớp để tiếp tục.',
      );
    }
    if (req.tokenExpired) {
      return sendError(res, 401, 'TOKEN_EXPIRED', 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
    }
    return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  };
}
