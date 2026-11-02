import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { requirePermission } from '../src/auth/middleware.js';
import { Role } from '../src/generated/prisma/enums.js';

function run(role: Role | null, permission: Parameters<typeof requirePermission>[0]) {
  const req = { user: role ? { role } : null, originalUrl: '/admin/dishes' } as unknown as Request;
  const res = {
    redirect: vi.fn(),
  } as unknown as Response & { redirect: ReturnType<typeof vi.fn> };
  const next = vi.fn();
  requirePermission(permission)(req, res, next as unknown as NextFunction);
  return { res, next };
}

describe('content CRUD RBAC', () => {
  it('lets VIEWER read (list/detail) but blocks every write', () => {
    expect(run(Role.VIEWER, 'content:view').next).toBeCalledWith();

    for (const perm of [
      'dish:create',
      'dish:update',
      'dish:delete',
      'chef:create',
      'chef:update',
      'chef:delete',
      'ingredient:create',
      'ingredient:update',
      'ingredient:delete',
    ] as const) {
      const { next } = run(Role.VIEWER, perm);
      const err = next.mock.calls[0]?.[0];
      expect(err?.status).toBe(403);
    }
  });

  it('lets STAFF read and write content but not manage users', () => {
    expect(run(Role.STAFF, 'content:view').next).toBeCalledWith();
    expect(run(Role.STAFF, 'dish:create').next).toBeCalledWith();
    expect(run(Role.STAFF, 'dish:delete').next).toBeCalledWith();

    const denied = run(Role.STAFF, 'user:manage');
    expect(denied.next.mock.calls[0]?.[0]?.status).toBe(403);
  });

  it('lets ADMIN read, write and manage users', () => {
    expect(run(Role.ADMIN, 'content:view').next).toBeCalledWith();
    expect(run(Role.ADMIN, 'dish:delete').next).toBeCalledWith();
    expect(run(Role.ADMIN, 'user:manage').next).toBeCalledWith();
  });

  it('redirects an unauthenticated visitor to /login', () => {
    const { res, next } = run(null, 'content:view');
    expect(res.redirect).toHaveBeenCalledWith(303, '/login?next=%2Fadmin%2Fdishes');
    expect(next).not.toHaveBeenCalled();
  });
});