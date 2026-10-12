import { describe, it, expect } from 'vitest';
import { can } from '../src/auth/permissions.js';
import { Role } from '../src/generated/prisma/enums.js';

describe('RBAC Permissions', () => {
  const admin = { role: Role.ADMIN };
  const staff = { role: Role.STAFF };
  const customer = { role: Role.CUSTOMER };

  it('allows ADMIN to access admin panel, CRUD dishes, and manage users', () => {
    expect(can(admin, 'admin:access')).toBe(true);
    expect(can(admin, 'dish:create')).toBe(true);
    expect(can(admin, 'dish:delete')).toBe(true);
    expect(can(admin, 'chef:create')).toBe(true);
    expect(can(admin, 'ingredient:delete')).toBe(true);
    expect(can(admin, 'user:manage')).toBe(true);
  });

  it('denies STAFF access to the admin panel (ADMIN only)', () => {
    expect(can(staff, 'admin:access')).toBe(false);
    expect(can(staff, 'dish:create')).toBe(false);
    expect(can(staff, 'dish:update')).toBe(false);
    expect(can(staff, 'dish:delete')).toBe(false);
    expect(can(staff, 'chef:create')).toBe(false);
    expect(can(staff, 'ingredient:create')).toBe(false);
    expect(can(staff, 'user:manage')).toBe(false);
  });

  it('denies CUSTOMER all admin permissions', () => {
    expect(can(customer, 'admin:access')).toBe(false);
    expect(can(customer, 'dish:create')).toBe(false);
    expect(can(customer, 'dish:delete')).toBe(false);
    expect(can(customer, 'user:manage')).toBe(false);
  });

  it('denies unauthenticated visitors (null or undefined)', () => {
    expect(can(null, 'admin:access')).toBe(false);
    expect(can(undefined, 'dish:create')).toBe(false);
  });
});
