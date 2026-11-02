import { describe, it, expect, beforeEach } from 'vitest';
import {
  FORGOT_COOLDOWN_MS,
  FORGOT_MAX_REQUESTS,
  FORGOT_WINDOW_MS,
  RESET_TOKEN_TTL_MS,
  consumeForgotRequest,
  decideForgotRequest,
  createResetToken,
  hashResetToken,
  isResetRequestValid,
  isSessionIssuedAfterPasswordChange,
  normalizeEmail,
  resetForgotRateLimit,
  resetTokenExpiry,
} from '../src/auth/password-reset.js';

describe('password reset helpers', () => {
  beforeEach(() => resetForgotRateLimit());

  it('normalizes email consistently', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('creates opaque tokens and stores only their digest', () => {
    const token = createResetToken();
    const hash = hashResetToken(token);

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashResetToken(token)).toBe(hash);
    expect(hashResetToken(createResetToken())).not.toBe(hash);
  });

  it('expires reset links after the published 15 minutes', () => {
    const now = 1_700_000_000_000;
    expect(resetTokenExpiry(now).getTime()).toBe(now + RESET_TOKEN_TTL_MS);
    expect(RESET_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('accepts only unused, unexpired rows', () => {
    const now = 1_700_000_000_000;
    const valid = { usedAt: null, expiresAt: new Date(now + 1_000) };
    expect(isResetRequestValid(valid, now)).toBe(true);
    expect(isResetRequestValid({ ...valid, usedAt: new Date(now) }, now)).toBe(false);
    expect(isResetRequestValid({ usedAt: null, expiresAt: new Date(now - 1) }, now)).toBe(false);
  });

  it('enforces a 30-second cooldown between forgot-password attempts for the same email', () => {
    const now = 1_700_000_000_000;
    expect(decideForgotRequest(' User@Example.com ', now)).toEqual({ allowed: true });
    expect(decideForgotRequest('user@example.com', now + 5_000)).toEqual({
      allowed: false,
      reason: 'cooldown',
      retryAfterSeconds: 25,
    });
    expect(decideForgotRequest('other@example.com', now + 5_000)).toEqual({ allowed: true });
    expect(decideForgotRequest('user@example.com', now + FORGOT_COOLDOWN_MS)).toEqual({
      allowed: true,
    });
  });

  it('limits reset requests per normalized email within the 15-minute window', () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < FORGOT_MAX_REQUESTS; i += 1) {
      expect(consumeForgotRequest(' User@Example.com ', now + i * FORGOT_COOLDOWN_MS)).toBe(true);
    }
    const afterAll = now + FORGOT_MAX_REQUESTS * FORGOT_COOLDOWN_MS;
    expect(decideForgotRequest('user@example.com', afterAll)).toMatchObject({
      allowed: false,
      reason: 'max',
    });
    expect(consumeForgotRequest('other@example.com', afterAll)).toBe(true);
  });

  it('allows requests again after the 15-minute window', () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < FORGOT_MAX_REQUESTS; i += 1) {
      consumeForgotRequest('user@example.com', now + i * FORGOT_COOLDOWN_MS);
    }
    expect(consumeForgotRequest('user@example.com', now + FORGOT_WINDOW_MS)).toBe(true);
  });

  it('rejects sessions issued before a password change', () => {
    const changedAt = new Date('2026-11-02T10:00:00.000Z');
    expect(isSessionIssuedAfterPasswordChange(null, null)).toBe(true);
    expect(isSessionIssuedAfterPasswordChange(undefined, changedAt)).toBe(true);
    expect(isSessionIssuedAfterPasswordChange(changedAt.getTime() / 1000 - 1, changedAt)).toBe(
      false,
    );
    expect(isSessionIssuedAfterPasswordChange(changedAt.getTime() / 1000, changedAt)).toBe(true);
    expect(isSessionIssuedAfterPasswordChange(changedAt.getTime() / 1000 + 1, changedAt)).toBe(
      true,
    );
  });
});
