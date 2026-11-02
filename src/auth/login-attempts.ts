import { normalizeEmail } from './email.js';

/**
 * Server-side failed-login counter for the CAPTCHA/brute-force policy.
 *
 * Two independent keys are used: the normalized email and the client IP. They
 * live in process memory (not in a cookie), so deleting cookies or opening a
 * fresh anonymous session cannot reset either counter. A successful login only
 * clears the email key, leaving the IP burst limit intact.
 */
const CAPTCHA_THRESHOLD = 3;
const LOCK_THRESHOLD = 10;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

export interface LoginAttemptState {
  failures: number;
  windowStart: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, LoginAttemptState>();

export const LOGIN_POLICY = {
  captchaThreshold: CAPTCHA_THRESHOLD,
  lockThreshold: LOCK_THRESHOLD,
  windowMs: WINDOW_MS,
  lockMs: LOCK_MS,
} as const;

export { normalizeEmail };

export function emailKey(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

export function ipKey(ip: string | undefined): string {
  return `ip:${ip || 'unknown'}`;
}

export function attemptKeys(email: string, ip?: string): string[] {
  const keys = [emailKey(email)];
  if (ip) keys.push(ipKey(ip));
  return keys;
}

function asKeys(input: string | string[]): string[] {
  if (Array.isArray(input)) return input;
  // Accept either a raw email (convenience for callers/tests) or an already
  // namespaced key such as `email:...` / `ip:...`.
  return input.startsWith('email:') || input.startsWith('ip:') ? [input] : [emailKey(input)];
}

function fresh(now: number): LoginAttemptState {
  return { failures: 0, windowStart: now, lockedUntil: null };
}

function isExpired(entry: LoginAttemptState, now: number): boolean {
  const lockExpired = entry.lockedUntil !== null && entry.lockedUntil <= now;
  const windowExpired = now - entry.windowStart >= WINDOW_MS;
  return lockExpired || (entry.lockedUntil === null && windowExpired);
}

function prune(now: number): void {
  for (const [key, entry] of attempts) {
    if (isExpired(entry, now)) attempts.delete(key);
  }
}

function readKey(key: string, now: number): LoginAttemptState {
  const entry = attempts.get(key);
  if (!entry) return fresh(now);
  if (isExpired(entry, now)) {
    const clean = fresh(now);
    attempts.set(key, clean);
    return { ...clean };
  }
  return { ...entry };
}

function combine(states: LoginAttemptState[], now: number): LoginAttemptState {
  if (states.length === 0) return fresh(now);
  const lockedUntil = states.reduce<number | null>(
    (max, s) => (s.lockedUntil !== null && (max === null || s.lockedUntil > max) ? s.lockedUntil : max),
    null,
  );
  return {
    failures: Math.max(...states.map((s) => s.failures)),
    windowStart: Math.min(...states.map((s) => s.windowStart)),
    lockedUntil,
  };
}

export function getLoginAttemptState(input: string | string[], now = Date.now()): LoginAttemptState {
  const states = asKeys(input).map((key) => readKey(key, now));
  return combine(states, now);
}

export function registerFailedLogin(
  input: string | string[],
  now = Date.now(),
): LoginAttemptState {
  const keys = asKeys(input);
  for (const key of keys) {
    const current = attempts.get(key);
    const entry = !current || isExpired(current, now) ? fresh(now) : current;
    entry.failures += 1;
    if (entry.failures >= LOCK_THRESHOLD) entry.lockedUntil = now + LOCK_MS;
    attempts.set(key, entry);
  }

  if (attempts.size > MAX_ENTRIES) prune(now);
  return combine(
    keys.map((key) => readKey(key, now)),
    now,
  );
}

export function clearLoginAttempts(input: string | string[]): void {
  for (const key of asKeys(input)) attempts.delete(key);
}

export function isLocked(state: LoginAttemptState, now = Date.now()): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

export function isCaptchaRequired(state: LoginAttemptState): boolean {
  return state.failures >= CAPTCHA_THRESHOLD;
}

/** Test-only helper: clear all counters between cases. */
export function resetLoginAttempts(): void {
  attempts.clear();
}
