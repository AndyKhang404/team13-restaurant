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
 * Sliding-window limit keyed by normalized email. It is deliberately checked
 * before any user lookup so a 429 does not reveal whether the email exists.
 */
export function consumeForgotRequest(email: string, now = Date.now()): boolean {
  const key = normalizeEmail(email);
  const recent = (forgotHits.get(key) ?? []).filter((t) => now - t < FORGOT_WINDOW_MS);
  if (recent.length >= FORGOT_MAX_REQUESTS) {
    forgotHits.set(key, recent);
    return false;
  }
  recent.push(now);
  forgotHits.set(key, recent);

  if (forgotHits.size > 5000) {
    for (const [k, v] of forgotHits) {
      if (v.every((t) => now - t >= FORGOT_WINDOW_MS)) forgotHits.delete(k);
    }
  }
  return true;
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
