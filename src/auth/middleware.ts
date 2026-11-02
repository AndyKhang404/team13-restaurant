import type { RequestHandler } from 'express';
import { AccountStatus } from '../generated/prisma/enums.js';
import { forbidden } from '../lib/http.js';
import { can, type Permission } from './permissions.js';
import { SESSION_COOKIE, findSession, revokeSession } from './session.js';

export const loadUser: RequestHandler = async (req, res, next) => {
  req.user = null;
  const sid = typeof req.cookies?.[SESSION_COOKIE] === 'string' ? req.cookies[SESSION_COOKIE] : '';

  if (sid) {
    const session = await findSession(sid);
    const now = new Date();
    const valid =
      session !== null &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > now.getTime() &&
      session.user.status === AccountStatus.ACTIVE;

    if (valid) {
      req.user = session.user;
    } else if (session) {
      await revokeSession(sid).catch(() => undefined);
    }
  }

  res.locals.user = req.user;
  next();
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.user) return next();
  res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (!req.user) return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (!can(req.user, permission)) return next(forbidden());
    next();
  };
}
