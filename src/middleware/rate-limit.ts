import type { RequestHandler } from 'express';
import { sendError } from '../lib/http.js';

/**
 * Tiny in-memory rate limiter for abuse-prone POST forms (login/register).
 * Keyed by client IP + path inside a sliding window. On excess, re-renders
 * the same auth form with 429 instead of crashing or silently dropping.
 * Not for distributed setups — a single Node process (đồ án) is assumed.
 */
export function authRateLimit({ windowMs = 60_000, max = 20 }: { windowMs?: number; max?: number } = {}): RequestHandler {
  const hits = new Map<string, number[]>();
  const MESSAGE = 'Bạn thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.';

  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    // Opportunistic cleanup so the map cannot grow forever.
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }

    if (recent.length > max) {
      return sendError(res, 429, 'RATE_LIMITED', MESSAGE);
    }
    next();
  };
}

/**
 * Per-email sliding-window rate limiter for OTP verification and resend endpoints.
 * Defaults to max 5 tries in 15 minutes per email address (falls back to client IP
 * when email is absent).
 */
export function otpRateLimit({
  windowMs = 15 * 60_000,
  max = 5,
}: { windowMs?: number; max?: number } = {}): RequestHandler {
  const hits = new Map<string, number[]>();
  const MESSAGE = 'Bạn đã thử quá 5 lần trong 15 phút. Vui lòng đợi rồi thử lại.';

  return (req, res, next) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const subject = rawEmail || `ip:${req.ip}`;
    const key = `${req.path}:${subject}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);

    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }

    if (recent.length > max) {
      return sendError(res, 429, 'RATE_LIMITED', MESSAGE);
    }
    next();
  };
}
