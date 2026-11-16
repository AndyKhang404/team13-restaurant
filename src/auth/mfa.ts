/**
 * Helpers for Supabase Auth MFA (TOTP + recovery codes).
 *
 * Supabase stores the factor secret; the app only mirrors status in
 * `mfa_states` for AAL enforcement and lockout.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export const MFA_MAX_ATTEMPTS = 5;
export const MFA_LOCK_MS = 15 * 60 * 1000;
/** Same code must be rejected for the whole 30s window plus the allowed skew. */
export const MFA_REPLAY_WINDOW_MS = 90 * 1000;

export function hashMfaCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function isReplayedMfaCode(
  lastCodeHash: string | null | undefined,
  lastCodeAt: Date | null | undefined,
  code: string,
  now: number = Date.now(),
): boolean {
  if (!lastCodeHash || !lastCodeAt) return false;
  if (lastCodeHash !== hashMfaCode(code)) return false;
  return now - lastCodeAt.getTime() < MFA_REPLAY_WINDOW_MS;
}

/** Unambiguous alphabet for human-typed backup codes (no I/O/0/1). */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MFA_RECOVERY_CODE_COUNT = 10;
export const MFA_RECOVERY_CODE_LENGTH = 10;

export function generateRecoveryCodes(
  count = MFA_RECOVERY_CODE_COUNT,
  length = MFA_RECOVERY_CODE_LENGTH,
): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const bytes = randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i++) {
      const byte = bytes[i] ?? 0;
      code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length] ?? 'A';
    }
    codes.add(code);
  }
  return [...codes];
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashRecoveryCode(code: string): string {
  // Keyed hash: a DB leak alone cannot be used to brute-force backup codes.
  return createHmac('sha256', env.CSRF_SECRET)
    .update(normalizeRecoveryCode(code))
    .digest('hex');
}

export interface SupabaseAuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

export interface MfaFactorSummary {
  id: string;
  factorType: string;
  status: string;
  friendlyName?: string;
}

interface FactorLike {
  id: string;
  factor_type?: string;
  status?: string;
  friendly_name?: string;
}

/** Verified MFA factors that matter for login (TOTP and recovery codes). */
export function verifiedMfaFactors(
  user: { factors?: FactorLike[] } | null | undefined,
): MfaFactorSummary[] {
  return (user?.factors ?? [])
    .filter(
      (factor) =>
        factor.status === 'verified' &&
        (factor.factor_type === 'totp' || factor.factor_type === 'recovery_code'),
    )
    .map((factor) => ({
      id: factor.id,
      factorType: factor.factor_type ?? '',
      status: factor.status ?? '',
      friendlyName: factor.friendly_name,
    }));
}

export function findTotpFactor(
  user: { factors?: FactorLike[] } | null | undefined,
): MfaFactorSummary | null {
  return verifiedMfaFactors(user).find((factor) => factor.factorType === 'totp') ?? null;
}

export function hasVerifiedMfa(user: { factors?: FactorLike[] } | null | undefined): boolean {
  return verifiedMfaFactors(user).length > 0;
}

export interface MfaErrorInfo {
  code: string;
  message: string;
  status?: number;
}

/** Maps Supabase Auth MFA errors to the app's `{ ok:false, error }` contract. */
export function mapMfaError(
  error: SupabaseAuthErrorLike | null | undefined,
  fallbackCode = 'MFA_ERROR',
): MfaErrorInfo {
  const code = error?.code ?? '';
  const status = error?.status;

  switch (code) {
    case 'mfa_verification_failed':
      return {
        code: 'INVALID_MFA_CODE',
        message: 'Mã xác thực không đúng hoặc đã hết hạn.',
        status,
      };
    case 'mfa_challenge_expired':
      return {
        code: 'MFA_CHALLENGE_EXPIRED',
        message: 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.',
        status,
      };
    case 'mfa_factor_not_found':
      return {
        code: 'MFA_NOT_ENABLED',
        message: 'Tài khoản chưa bật xác thực hai lớp.',
        status,
      };
    case 'insufficient_aal':
      return {
        code: 'MFA_REQUIRED',
        message: 'Vui lòng xác thực hai lớp để tiếp tục.',
        status,
      };
    case 'mfa_totp_enroll_not_enabled':
      return {
        code: 'MFA_UNAVAILABLE',
        message: 'Tính năng xác thực hai lớp hiện chưa khả dụng.',
        status,
      };
    case 'mfa_verified_factor_exists':
      return {
        code: 'MFA_ALREADY_ENABLED',
        message: 'Tài khoản đã bật xác thực hai lớp.',
        status,
      };
    case 'mfa_factor_name_conflict':
      return {
        code: 'MFA_ERROR',
        message: 'Không thể tạo xác thực hai lớp lúc này. Vui lòng thử lại.',
        status,
      };
    case 'mfa_recovery_codes_locked':
      return {
        code: 'MFA_LOCKED',
        message: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.',
        status,
      };
    case 'mfa_recovery_codes_enroll_not_enabled':
    case 'mfa_recovery_codes_verify_not_enabled':
    case 'mfa_recovery_codes_unsupported':
    case 'mfa_recovery_codes_not_found':
      return {
        code: 'MFA_RECOVERY_UNAVAILABLE',
        message: 'Tính năng mã khôi phục hiện chưa khả dụng. Vui lòng liên hệ quản trị viên.',
        status,
      };
    case 'over_request_rate_limit':
      return {
        code: 'RATE_LIMITED',
        message: 'Bạn thử quá nhiều lần. Vui lòng đợi rồi thử lại.',
        status: 429,
      };
    default:
      return {
        code: fallbackCode,
        message: 'Không thể xử lý xác thực hai lớp. Vui lòng thử lại.',
        status,
      };
  }
}

export function isMfaLocked(lockedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}

export function mfaLockMinutes(lockedUntil: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}

export interface MfaFailureResult {
  failedAttempts: number;
  lockedUntil: Date | null;
  locked: boolean;
}

/** Counts a failed code attempt and locks the account after 5 tries. */
export function registerMfaFailure(
  failedAttempts: number,
  now: Date = new Date(),
): MfaFailureResult {
  const attempts = failedAttempts + 1;
  if (attempts >= MFA_MAX_ATTEMPTS) {
    return {
      failedAttempts: attempts,
      lockedUntil: new Date(now.getTime() + MFA_LOCK_MS),
      locked: true,
    };
  }
  return { failedAttempts: attempts, lockedUntil: null, locked: false };
}

/** Coerces the request body's code/recoveryCode values into trimmed strings. */
export function readMfaCode(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
