import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const { findSession, revokeSession } = vi.hoisted(() => ({
  findSession: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock('../src/auth/session.js', () => ({
  SESSION_COOKIE: 'sid',
  findSession,
  revokeSession,
}));

import { loadUser, requireAuth, requirePermission } from '../src/auth/middleware.js';

const ACTIVE_USER = {
  id: 'user-1',
  email: 'a@b.com',
  role: 'VIEWER',
  status: 'ACTIVE',
};

function mockReq(cookies: Record<string, string> = {}): Request {
  return { cookies, originalUrl: '/admin/dishes' } as unknown as Request;
}

function mockRes() {
  const res = {
    locals: {} as Record<string, unknown>,
    redirect: vi.fn(),
    status: vi.fn(),
  };
  return res as unknown as Response & {
    locals: Record<string, unknown>;
    redirect: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

describe('local session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revokeSession.mockResolvedValue(undefined);
  });

  it('attaches an ACTIVE user for a live session', async () => {
    findSession.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: ACTIVE_USER,
    });
    const req = mockReq({ sid: 'abc' });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await loadUser(req, res, next);

    expect(findSession).toHaveBeenCalledWith('abc');
    expect(req.user).toEqual(ACTIVE_USER);
    expect(res.locals.user).toEqual(ACTIVE_USER);
    expect(next).toHaveBeenCalledOnce();
  });

  it('revokes an expired session and does not attach a user', async () => {
    findSession.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
      user: ACTIVE_USER,
    });
    const req = mockReq({ sid: 'old' });
    const res = mockRes();

    await loadUser(req, res, vi.fn() as NextFunction);

    expect(req.user).toBeNull();
    expect(revokeSession).toHaveBeenCalledWith('old');
  });

  it('does not attach a PENDING user', async () => {
    findSession.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...ACTIVE_USER, status: 'PENDING' },
    });
    const req = mockReq({ sid: 'abc' });
    const res = mockRes();

    await loadUser(req, res, vi.fn() as NextFunction);

    expect(req.user).toBeNull();
    expect(revokeSession).toHaveBeenCalledWith('abc');
  });

  it('skips the database when there is no sid cookie', async () => {
    const req = mockReq();
    const res = mockRes();

    await loadUser(req, res, vi.fn() as NextFunction);

    expect(findSession).not.toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  it('redirects anonymous CRUD requests with 303 to /login', () => {
    const req = { ...mockReq(), user: null } as Request;
    const res = mockRes();

    requireAuth(req, res, vi.fn());

    expect(res.status).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(303, '/login?next=%2Fadmin%2Fdishes');
  });

  it('returns 403 through next() for a signed-in user without the permission', () => {
    const req = { ...mockReq(), user: { ...ACTIVE_USER, role: 'VIEWER' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission('user:manage')(req, res, next as NextFunction);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]?.status).toBe(403);
  });
});
