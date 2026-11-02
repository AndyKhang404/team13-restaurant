import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { env, isProd } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export const SESSION_COOKIE = 'sid';

export const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export function hashSid(sid: string): string {
  return createHash('sha256').update(sid).digest('hex');
}

function newSid(): string {
  return randomBytes(32).toString('base64url');
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
};

/** Creates a fresh server-side session and returns the opaque cookie value. */
export async function createSession(userId: string): Promise<{ sid: string; expiresAt: Date }> {
  const sid = newSid();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { sidHash: hashSid(sid), userId, expiresAt },
  });
  return { sid, expiresAt };
}

export async function findSession(sid: string) {
  return prisma.session.findUnique({
    where: { sidHash: hashSid(sid) },
    include: { user: true },
  });
}

export async function revokeSession(sid: string): Promise<void> {
  await prisma.session.updateMany({
    where: { sidHash: hashSid(sid), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Deletes rows that can no longer authenticate anything: expired sessions and
 * sessions revoked long ago. Run periodically so the table does not grow
 * forever (the deck calls for periodic cleanup of expired records).
 */
export async function pruneSessions(now = new Date()): Promise<number> {
  const revokedCutoff = new Date(now.getTime() - SESSION_TTL_MS);
  const { count } = await prisma.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null, lte: revokedCutoff } }],
    },
  });
  return count;
}

export function setSessionCookie(res: Response, sid: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, sid, {
    ...cookieOptions,
    expires: expiresAt,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
