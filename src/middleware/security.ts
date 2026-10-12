import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { doubleCsrf } from 'csrf-csrf';
import { env, isProd } from '../config/env.js';
import type { FlashMessage } from '../types/express.js';

const SID_COOKIE = 'sid';
const FLASH_COOKIE = 'flash';

/**
 * Stable anonymous browser id (signed cookie). Binds CSRF tokens to a browser
 * without needing server-side sessions.
 */
export const browserId: RequestHandler = (req, res, next) => {
  const current = req.signedCookies?.[SID_COOKIE];
  if (typeof current === 'string' && current) return next();
  const sid = randomUUID();
  res.cookie(SID_COOKIE, sid, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
  req.signedCookies = { ...req.signedCookies, [SID_COOKIE]: sid };
  next();
};

/** One-time messages carried across a redirect in a signed cookie. */
export const flash: RequestHandler = (req, res, next) => {
  let incoming: FlashMessage[] = [];
  const raw = req.signedCookies?.[FLASH_COOKIE];
  if (typeof raw === 'string') {
    try {
      incoming = JSON.parse(raw) as FlashMessage[];
    } catch {
      incoming = [];
    }
    res.clearCookie(FLASH_COOKIE);
  }
  res.locals.flash = incoming;

  const outgoing: FlashMessage[] = [];
  req.flash = (type, message) => {
    outgoing.push({ type, message });
    res.cookie(FLASH_COOKIE, JSON.stringify(outgoing), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
    });
  };
  next();
};

/**
 * Parses multipart bodies for *every* route (files kept in memory) so the CSRF
 * check below can always see `_csrf`. The hard limit is generous; the 2 MB image
 * rule is enforced per-field with a friendly form error (see lib/storage.ts).
 */
const multipartParser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2, fields: 2000 },
}).any();

export const multipart: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  multipartParser(req, res, next);
};

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req: Request) => String(req.signedCookies?.[SID_COOKIE] ?? ''),
  cookieName: isProd ? '__Host-x-csrf-token' : 'x-csrf-token',
  cookieOptions: { sameSite: 'lax', secure: isProd, path: '/', httpOnly: true },
  getCsrfTokenFromRequest: (req: Request) =>
    (req.body as Record<string, unknown> | undefined)?._csrf as string | undefined ??
    (req.headers['x-csrf-token'] as string | undefined),
});

export const csrfProtection = doubleCsrfProtection;

/** Exposes a CSRF token to every view as `{{csrfToken}}`. */
export const csrfToken: RequestHandler = (req, res, next) => {
  res.locals.csrfToken = generateCsrfToken(req, res);
  next();
};
