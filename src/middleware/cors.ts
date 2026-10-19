import cors from 'cors';
import type { RequestHandler } from 'express';
import { env, isProd } from '../config/env.js';

/** Local dev SPA hosts (Vite, preview servers) allowed while not in production. */
const devOriginPatterns = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

/** Extra browser origins allowed to call the API (comma-separated). */
const configuredOrigins = (env.SPA_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Decides whether a browser origin may call the API. Same-origin and
 * non-browser requests (no `Origin`) always pass; dev localhost origins pass
 * while not in production; anything else must be listed in `SPA_ORIGIN`.
 */
export function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;
  if (!isProd && devOriginPatterns.some((pattern) => pattern.test(origin))) return true;
  return false;
}

/**
 * CORS for the SPA. Credentials (the session + CSRF cookies) are allowed, so the
 * origin is reflected explicitly instead of `*`.
 */
export const corsMiddleware: RequestHandler = cors({
  origin(origin, callback) {
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
});
