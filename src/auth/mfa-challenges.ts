/**
 * Short-lived login challenges for users who still need to pass MFA.
 *
 * The Supabase AAL1 session is held server-side only: the browser never
 * receives its access/refresh tokens. A challenge is single-use, expires
 * after five minutes, and is dropped after five failed code attempts.
 *
 * In-memory, like token-revocation/login-attempts: single Node process only.
 */
import { randomUUID } from 'node:crypto';

export interface MfaChallenge {
  id: string;
  userId: string;
  factorId: string | null;
  accessToken: string;
  refreshToken: string;
  email: string;
  redirectTo: string;
  expiresAt: number;
  attempts: number;
}

export interface CreateMfaChallengeInput {
  userId: string;
  factorId: string | null;
  accessToken: string;
  refreshToken: string;
  email: string;
  redirectTo: string;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 5000;

const challenges = new Map<string, MfaChallenge>();

function prune(now: number): void {
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(id);
  }
}

export function createMfaChallenge(input: CreateMfaChallengeInput): MfaChallenge {
  const now = Date.now();
  if (challenges.size > MAX_ENTRIES) prune(now);

  const challenge: MfaChallenge = {
    id: randomUUID(),
    ...input,
    expiresAt: now + CHALLENGE_TTL_MS,
    attempts: 0,
  };
  challenges.set(challenge.id, challenge);
  return challenge;
}

export function getMfaChallenge(id: string | undefined): MfaChallenge | null {
  if (!id) return null;
  const challenge = challenges.get(id);
  if (!challenge) return null;
  if (challenge.expiresAt <= Date.now()) {
    challenges.delete(id);
    return null;
  }
  return challenge;
}

/** Returns the new attempt count, or null when the challenge is gone. */
export function registerMfaChallengeFailure(id: string): number | null {
  const challenge = challenges.get(id);
  if (!challenge) return null;

  challenge.attempts += 1;
  if (challenge.attempts >= MAX_ATTEMPTS) {
    challenges.delete(id);
    return challenge.attempts;
  }
  return challenge.attempts;
}

export function deleteMfaChallenge(id: string): void {
  challenges.delete(id);
}

export function resetMfaChallenges(): void {
  challenges.clear();
}

export const MFA_CHALLENGE_POLICY = {
  ttlMs: CHALLENGE_TTL_MS,
  maxAttempts: MAX_ATTEMPTS,
} as const;
