import { normalizeEmail } from './email.js';

const CAPTCHA_THRESHOLD = 3;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 5000;

export interface LoginAttemptState {
  failures: number;
  windowStart: number;
}

const attempts = new Map<string, LoginAttemptState>();

export const LOGIN_POLICY = {
  captchaThreshold: CAPTCHA_THRESHOLD,
  windowMs: WINDOW_MS,
} as const;

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
  return input.startsWith('email:') || input.startsWith('ip:') ? [input] : [emailKey(input)];
}

function fresh(now: number): LoginAttemptState {
  return { failures: 0, windowStart: now };
}

function isExpired(entry: LoginAttemptState, now: number): boolean {
  return now - entry.windowStart >= WINDOW_MS;
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
  return {
    failures: Math.max(...states.map((s) => s.failures)),
    windowStart: Math.min(...states.map((s) => s.windowStart)),
  };
}

export function getLoginAttemptState(
  input: string | string[],
  now = Date.now(),
): LoginAttemptState {
  return combine(
    asKeys(input).map((key) => readKey(key, now)),
    now,
  );
}

export function registerFailedLogin(input: string | string[], now = Date.now()): LoginAttemptState {
  const keys = asKeys(input);
  for (const key of keys) {
    const current = attempts.get(key);
    const entry = !current || isExpired(current, now) ? fresh(now) : current;
    entry.failures += 1;
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

export function isCaptchaRequired(state: LoginAttemptState): boolean {
  return state.failures >= CAPTCHA_THRESHOLD;
}

export function resetLoginAttempts(): void {
  attempts.clear();
}
