import { describe, it, expect } from 'vitest';
import { can } from '../src/auth/permissions.js';
import { Role } from '../src/generated/prisma/enums.js';

describe('RBAC Permissions', () => {
  const admin = { role: Role.ADMIN };
  const staff = { role: Role.STAFF };
  const viewer = { role: Role.VIEWER };

  it('allows ADMIN to access admin panel, CRUD dishes, and manage users', () => {
    expect(can(admin, 'admin:access')).toBe(true);
    expect(can(admin, 'dish:create')).toBe(true);
    expect(can(admin, 'dish:delete')).toBe(true);
    expect(can(admin, 'chef:create')).toBe(true);
    expect(can(admin, 'ingredient:delete')).toBe(true);
    expect(can(admin, 'user:manage')).toBe(true);
  });

  it('allows STAFF to access admin panel and content CRUD, but denies user:manage', () => {
    expect(can(staff, 'admin:access')).toBe(true);
    expect(can(staff, 'dish:create')).toBe(true);
    expect(can(staff, 'dish:update')).toBe(true);
    expect(can(staff, 'dish:delete')).toBe(true);
    expect(can(staff, 'chef:create')).toBe(true);
    expect(can(staff, 'ingredient:create')).toBe(true);
    expect(can(staff, 'user:manage')).toBe(false);
  });

  it('denies VIEWER all admin permissions', () => {
    expect(can(viewer, 'admin:access')).toBe(false);
    expect(can(viewer, 'dish:create')).toBe(false);
    expect(can(viewer, 'dish:delete')).toBe(false);
    expect(can(viewer, 'user:manage')).toBe(false);
  });

  it('denies unauthenticated visitors (null or undefined)', () => {
    expect(can(null, 'admin:access')).toBe(false);
    expect(can(undefined, 'dish:create')).toBe(false);
  });
});
