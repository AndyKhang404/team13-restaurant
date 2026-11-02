import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export const OTP_TTL_MS = env.OTP_TTL_MINUTES * 60 * 1000;
export const OTP_MAX_ATTEMPTS = env.OTP_MAX_ATTEMPTS;
export const OTP_LOCK_MS = env.OTP_LOCK_MINUTES * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
export const OTP_MAX_SENDS = env.OTP_MAX_SENDS_PER_HOUR;
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;

export interface ChallengeState {
  attempts: number;
  expiresAt: Date;
  lockedUntil: Date | null;
  lastSentAt: Date;
  sendCount: number;
  sendWindowStart: Date;
  usedAt: Date | null;
}

/** Six random digits, including leading zeros. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * OTPs are short, so a plain SHA-256 would be brute-forceable if the database
 * leaked. HMAC with the server secret keeps the stored value useful only to
 * this app, and the user id prevents cross-account hash reuse.
 */
export function hashOtp(userId: string, otp: string): string {
  return createHmac('sha256', env.CSRF_SECRET).update(`${userId}:${otp}`).digest('hex');
}

export function verifyOtpHash(userId: string, otp: string, storedHash: string): boolean {
  const actual = Buffer.from(hashOtp(userId, otp), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function otpExpiry(now = Date.now()): Date {
  return new Date(now + OTP_TTL_MS);
}

export function isChallengeLocked(challenge: ChallengeState, now = Date.now()): boolean {
  return challenge.lockedUntil !== null && challenge.lockedUntil.getTime() > now;
}

export function isChallengeUsable(challenge: ChallengeState, now = Date.now()): boolean {
  return (
    challenge.usedAt === null &&
    challenge.expiresAt.getTime() > now &&
    !isChallengeLocked(challenge, now)
  );
}

export type ResendDecision =
  | { allowed: true; sendCount: number; sendWindowStart: Date }
  | { allowed: false; reason: 'used' | 'cooldown' | 'max'; retryAfterSeconds: number };

/** Applies the per-account cooldown and hourly send cap without resetting attempts. */
export function resendDecision(challenge: ChallengeState, now = Date.now()): ResendDecision {
  if (challenge.usedAt !== null) {
    return { allowed: false, reason: 'used', retryAfterSeconds: 0 };
  }

  const sinceLastSend = now - challenge.lastSentAt.getTime();
  if (sinceLastSend < OTP_RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLastSend) / 1000),
    };
  }

  if (now - challenge.sendWindowStart.getTime() >= OTP_SEND_WINDOW_MS) {
    return { allowed: true, sendCount: 1, sendWindowStart: new Date(now) };
  }

  if (challenge.sendCount >= OTP_MAX_SENDS) {
    return {
      allowed: false,
      reason: 'max',
      retryAfterSeconds: Math.ceil(
        (challenge.sendWindowStart.getTime() + OTP_SEND_WINDOW_MS - now) / 1000,
      ),
    };
  }

  return {
    allowed: true,
    sendCount: challenge.sendCount + 1,
    sendWindowStart: challenge.sendWindowStart,
  };
}
