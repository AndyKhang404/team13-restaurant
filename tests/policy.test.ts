import { describe, it, expect } from 'vitest';
import { ProfileStatus, Role } from '../src/generated/prisma/enums.js';
import {
  authorize,
  canMutate,
  getRowPermissions,
  stripCreatedBy,
  type Action,
  type Subject,
} from '../src/auth/policy.js';

describe('ABAC Policy Engine', () => {
  const admin: Subject = { id: 'admin-1', role: Role.ADMIN, status: ProfileStatus.ACTIVE };
  const staffA: Subject = { id: 'staff-a', role: Role.STAFF, status: ProfileStatus.ACTIVE };
  const viewer: Subject = { id: 'viewer-1', role: Role.VIEWER, status: ProfileStatus.ACTIVE };

  const ownRow = { createdBy: 'staff-a', deletedAt: null };
  const otherRow = { createdBy: 'staff-b', deletedAt: null };
  const legacyRow = { createdBy: null, deletedAt: null };
  const ownDeletedRow = { createdBy: 'staff-a', deletedAt: new Date() };
  const otherDeletedRow = { createdBy: 'staff-b', deletedAt: new Date() };

  const contentMutateActions: Action[] = [
    'dish:update',
    'dish:delete',
    'chef:update',
    'chef:delete',
    'ingredient:update',
    'ingredient:delete',
  ];

  describe('ADMIN role', () => {
    it('allows ADMIN to mutate own, other-owned, and legacy null-owner rows', () => {
      for (const action of contentMutateActions) {
        expect(authorize(admin, action, ownRow)).toBeNull();
        expect(authorize(admin, action, otherRow)).toBeNull();
        expect(authorize(admin, action, legacyRow)).toBeNull();
      }
      expect(authorize(admin, 'user:manage')).toBeNull();
    });
  });

  describe('STAFF role ownership', () => {
    it('allows STAFF to create content and access admin', () => {
      expect(authorize(staffA, 'admin:access')).toBeNull();
      expect(authorize(staffA, 'dish:create')).toBeNull();
      expect(authorize(staffA, 'chef:create')).toBeNull();
      expect(authorize(staffA, 'ingredient:create')).toBeNull();
    });

    it('allows STAFF to mutate their own rows', () => {
      for (const action of contentMutateActions) {
        expect(authorize(staffA, action, ownRow)).toBeNull();
        expect(canMutate(staffA, action, ownRow)).toBe(true);
      }
    });

    it('denies STAFF from mutating other users rows with NOT_OWNER', () => {
      for (const action of contentMutateActions) {
        expect(authorize(staffA, action, otherRow)).toMatchObject({ code: 'NOT_OWNER' });
        expect(canMutate(staffA, action, otherRow)).toBe(false);
      }
    });

    it('denies STAFF from mutating legacy null-owner rows with NOT_OWNER', () => {
      for (const action of contentMutateActions) {
        expect(authorize(staffA, action, legacyRow)).toMatchObject({ code: 'NOT_OWNER' });
      }
    });

    it('denies STAFF user:manage with generic FORBIDDEN', () => {
      expect(authorize(staffA, 'user:manage')).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('SUSPENDED account status', () => {
    it('denies SUSPENDED accounts across all roles with ACCOUNT_SUSPENDED', () => {
      const suspendedAdmin: Subject = { ...admin, status: ProfileStatus.SUSPENDED };
      const suspendedStaff: Subject = { ...staffA, status: ProfileStatus.SUSPENDED };
      const suspendedViewer: Subject = { ...viewer, status: ProfileStatus.SUSPENDED };

      expect(authorize(suspendedAdmin, 'user:manage')).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
      expect(authorize(suspendedAdmin, 'dish:update', ownRow)).toMatchObject({
        code: 'ACCOUNT_SUSPENDED',
      });
      expect(authorize(suspendedStaff, 'dish:create')).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
      expect(authorize(suspendedStaff, 'dish:update', ownRow)).toMatchObject({
        code: 'ACCOUNT_SUSPENDED',
      });
      expect(authorize(suspendedViewer, 'admin:access')).toMatchObject({
        code: 'ACCOUNT_SUSPENDED',
      });
    });
  });

  describe('VIEWER and unauthenticated subjects', () => {
    it('denies VIEWER and null/undefined with FORBIDDEN', () => {
      expect(authorize(viewer, 'admin:access')).toMatchObject({ code: 'FORBIDDEN' });
      expect(authorize(viewer, 'dish:update', ownRow)).toMatchObject({ code: 'FORBIDDEN' });
      expect(authorize(null, 'dish:create')).toMatchObject({ code: 'FORBIDDEN' });
      expect(authorize(undefined, 'dish:update', ownRow)).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('getRowPermissions and stripCreatedBy', () => {
    it('computes active and deleted row permissions for ADMIN and STAFF', () => {
      expect(getRowPermissions('dish', ownRow, staffA)).toEqual({
        canUpdate: true,
        canDelete: true,
        canRestore: false,
      });
      expect(getRowPermissions('dish', otherRow, staffA)).toEqual({
        canUpdate: false,
        canDelete: false,
        canRestore: false,
      });
      expect(getRowPermissions('dish', legacyRow, staffA)).toEqual({
        canUpdate: false,
        canDelete: false,
        canRestore: false,
      });
      expect(getRowPermissions('dish', legacyRow, admin)).toEqual({
        canUpdate: true,
        canDelete: true,
        canRestore: false,
      });
      expect(getRowPermissions('dish', ownDeletedRow, staffA)).toEqual({
        canUpdate: true,
        canDelete: false,
        canRestore: true,
      });
      expect(getRowPermissions('dish', otherDeletedRow, staffA)).toEqual({
        canUpdate: false,
        canDelete: false,
        canRestore: false,
      });
      expect(getRowPermissions('chef', otherDeletedRow, admin)).toEqual({
        canUpdate: true,
        canDelete: false,
        canRestore: true,
      });
    });

    it('strips createdBy without mutating input object', () => {
      const original = { id: '1', name: 'Pho', createdBy: 'staff-a' };
      const stripped = stripCreatedBy(original);
      expect(stripped).toEqual({ id: '1', name: 'Pho' });
      expect('createdBy' in stripped).toBe(false);
      expect(original.createdBy).toBe('staff-a');
    });
  });
});
