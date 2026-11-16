import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MFA_CHALLENGE_POLICY,
  createMfaChallenge,
  deleteMfaChallenge,
  getMfaChallenge,
  registerMfaChallengeFailure,
  resetMfaChallenges,
} from '../src/auth/mfa-challenges.js';

const input = {
  userId: 'user-1',
  factorId: 'factor-1',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  email: 'user@example.com',
  redirectTo: '/profile',
};

describe('MFA login challenge store', () => {
  beforeEach(() => {
    resetMfaChallenges();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMfaChallenges();
  });

  it('creates a single-use challenge keyed by a random id', () => {
    const challenge = createMfaChallenge(input);

    expect(challenge.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(challenge.userId).toBe(input.userId);
    expect(challenge.factorId).toBe('factor-1');
    expect(challenge.attempts).toBe(0);
    expect(getMfaChallenge(challenge.id)).toEqual(challenge);
  });

  it('expires challenges after the configured TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const challenge = createMfaChallenge(input);
    vi.advanceTimersByTime(MFA_CHALLENGE_POLICY.ttlMs + 1);

    expect(getMfaChallenge(challenge.id)).toBeNull();
  });

  it('counts failed attempts and drops the challenge after five', () => {
    const challenge = createMfaChallenge(input);

    expect(registerMfaChallengeFailure(challenge.id)).toBe(1);
    expect(registerMfaChallengeFailure(challenge.id)).toBe(2);
    expect(registerMfaChallengeFailure(challenge.id)).toBe(3);
    expect(registerMfaChallengeFailure(challenge.id)).toBe(4);
    expect(registerMfaChallengeFailure(challenge.id)).toBe(5);
    expect(getMfaChallenge(challenge.id)).toBeNull();
  });

  it('deletes and resets challenges', () => {
    const first = createMfaChallenge(input);
    deleteMfaChallenge(first.id);
    expect(getMfaChallenge(first.id)).toBeNull();

    const second = createMfaChallenge(input);
    resetMfaChallenges();
    expect(getMfaChallenge(second.id)).toBeNull();
  });

  it('returns null for unknown ids', () => {
    expect(getMfaChallenge(undefined)).toBeNull();
    expect(getMfaChallenge('missing')).toBeNull();
  });
});
