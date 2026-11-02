import { createHash, randomBytes } from 'node:crypto';
import { normalizeEmail } from './email.js';

export { normalizeEmail };

/** Reset links are valid for 15 minutes (published in README). */
export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

/** At most 3 reset requests per normalized email inside 15 minutes. */
export const FORGOT_WINDOW_MS = 15 * 60 * 1000;
export const FORGOT_MAX_REQUESTS = 3;

/** Keep "email exists" and "email missing" responses indistinguishable by time. */
export const MIN_FORGOT_RESPONSE_MS = 250;

const forgotHits = new Map<string, number[]>();

/** Minimum gap between two forgot-password attempts for the same email. */
export const FORGOT_COOLDOWN_MS = 30 * 1000;

/** Opaque, high-entropy token that is only ever sent in the email link. */
export function createResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The database stores only this digest, never the token from the email. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function resetTokenExpiry(now = Date.now()): Date {
  return new Date(now + RESET_TOKEN_TTL_MS);
}

export function isResetRequestValid(
  row: { usedAt: Date | null; expiresAt: Date },
  now = Date.now(),
): boolean {
  return row.usedAt === null && row.expiresAt.getTime() > now;
}

/**
 * Sliding-window limit + per-attempt cooldown keyed by normalized email.
 * Deliberately checked before any user lookup so a 429 does not reveal
 * whether the email exists.
 */
export type ForgotDecision =
  | { allowed: true }
  | { allowed: false; reason: 'cooldown' | 'max'; retryAfterSeconds: number };

export function decideForgotRequest(email: string, now = Date.now()): ForgotDecision {
  const key = normalizeEmail(email);
  const recent = (forgotHits.get(key) ?? []).filter((t) => now - t < FORGOT_WINDOW_MS);
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < FORGOT_COOLDOWN_MS) {
    forgotHits.set(key, recent);
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterSeconds: Math.ceil((FORGOT_COOLDOWN_MS - (now - last)) / 1000),
    };
  }
  if (recent.length >= FORGOT_MAX_REQUESTS) {
    forgotHits.set(key, recent);
    const oldest = recent[0]!;
    return {
      allowed: false,
      reason: 'max',
      retryAfterSeconds: Math.ceil((oldest + FORGOT_WINDOW_MS - now) / 1000),
    };
  }
  recent.push(now);
  forgotHits.set(key, recent);

  if (forgotHits.size > 5000) {
    for (const [k, v] of forgotHits) {
      if (v.every((t) => now - t >= FORGOT_WINDOW_MS)) forgotHits.delete(k);
    }
  }
  return { allowed: true };
}

export function consumeForgotRequest(email: string, now = Date.now()): boolean {
  return decideForgotRequest(email, now).allowed;
}

/** Test helper; production code never needs to clear the limiter. */
export function resetForgotRateLimit(): void {
  forgotHits.clear();
}

export async function ensureMinimumDuration(
  startedAt: number,
  minimumMs = MIN_FORGOT_RESPONSE_MS,
): Promise<void> {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/**
 * After a password reset, JWTs issued before `passwordChangedAt` are rejected
 * by `loadUser` even if Supabase still considers them unexpired.
 */
export function isSessionIssuedAfterPasswordChange(
  issuedAtSeconds: unknown,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt) return true;
  const issuedAt = Number(issuedAtSeconds);
  if (!Number.isFinite(issuedAt)) return true;
  return issuedAt * 1000 >= passwordChangedAt.getTime();
}
