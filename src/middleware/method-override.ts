import type { RequestHandler } from 'express';

const OVERRIDE_METHODS = new Set(['PATCH', 'DELETE', 'PUT']);

/**
 * Lets plain HTML forms send PATCH/DELETE by posting a `_method` field
 * (forms can only natively send GET/POST). Must run AFTER body parsing —
 * including multipart — so `req.body._method` is available.
 */
export const methodOverride: RequestHandler = (req, _res, next) => {
  const raw = (req.body as Record<string, unknown> | undefined)?._method;
  const method = typeof raw === 'string' ? raw.toUpperCase().trim() : '';
  if (OVERRIDE_METHODS.has(method)) {
    req.method = method;
  }
  next();
};
