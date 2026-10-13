import type { RequestHandler } from 'express';

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
      const email = typeof req.body?.email === 'string' ? req.body.email : '';
      if (req.path === '/register') {
        const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
        return res.status(429).render('pages/auth/register', {
          title: 'Create account',
          values: { displayName, email },
          formError: MESSAGE,
        });
      }
      const next = typeof req.body?.next === 'string' ? req.body.next : '';
      return res.status(429).render('pages/auth/login', {
        title: 'Sign in',
        next,
        values: { email },
        formError: MESSAGE,
      });
    }
    next();
  };
}
