import { describe, it, expect } from 'vitest';
import { ProfileStatus, Role } from '../src/generated/prisma/enums.js';
import {
  authorize,
  canMutate,
  checkDishAdminFields,
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

  const staffUpdateActions: Action[] = ['dish:update', 'chef:update', 'ingredient:update'];
  const deleteActions: Action[] = ['dish:delete', 'chef:delete', 'ingredient:delete'];
  const allMutateActions: Action[] = [...staffUpdateActions, ...deleteActions];

  describe('ADMIN role', () => {
    it('allows ADMIN to mutate and delete own, other-owned, and legacy null-owner rows', () => {
      for (const action of allMutateActions) {
        expect(authorize(admin, action, ownRow)).toBeNull();
        expect(authorize(admin, action, otherRow)).toBeNull();
        expect(authorize(admin, action, legacyRow)).toBeNull();
      }
      expect(authorize(admin, 'user:manage')).toBeNull();
    });
  });

  describe('STAFF role ownership and delete restriction', () => {
    it('allows STAFF to create content and access admin', () => {
      expect(authorize(staffA, 'admin:access')).toBeNull();
      expect(authorize(staffA, 'dish:create')).toBeNull();
      expect(authorize(staffA, 'chef:create')).toBeNull();
      expect(authorize(staffA, 'ingredient:create')).toBeNull();
    });

    it('allows STAFF to update/restore their own rows, but denies delete with FORBIDDEN', () => {
      for (const action of staffUpdateActions) {
        expect(authorize(staffA, action, ownRow)).toBeNull();
        expect(canMutate(staffA, action, ownRow)).toBe(true);
      }
      for (const action of deleteActions) {
        expect(authorize(staffA, action, ownRow)).toMatchObject({ code: 'FORBIDDEN' });
        expect(canMutate(staffA, action, ownRow)).toBe(false);
      }
    });

    it('denies STAFF from updating other users rows with NOT_OWNER', () => {
      for (const action of staffUpdateActions) {
        expect(authorize(staffA, action, otherRow)).toMatchObject({ code: 'NOT_OWNER' });
        expect(canMutate(staffA, action, otherRow)).toBe(false);
      }
    });

    it('denies STAFF from updating legacy null-owner rows with NOT_OWNER', () => {
      for (const action of staffUpdateActions) {
        expect(authorize(staffA, action, legacyRow)).toMatchObject({ code: 'NOT_OWNER' });
      }
    });

    it('denies STAFF user:manage with generic FORBIDDEN', () => {
      expect(authorize(staffA, 'user:manage')).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('SUSPENDED and PENDING account statuses', () => {
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

    it('denies PENDING accounts across all roles with ACCOUNT_NOT_ACTIVATED', () => {
      const pendingAdmin: Subject = { ...admin, status: ProfileStatus.PENDING };
      const pendingStaff: Subject = { ...staffA, status: ProfileStatus.PENDING };
      const pendingViewer: Subject = { ...viewer, status: ProfileStatus.PENDING };

      expect(authorize(pendingAdmin, 'user:manage')).toMatchObject({
        code: 'ACCOUNT_NOT_ACTIVATED',
      });
      expect(authorize(pendingStaff, 'dish:create')).toMatchObject({
        code: 'ACCOUNT_NOT_ACTIVATED',
      });
      expect(authorize(pendingStaff, 'dish:update', ownRow)).toMatchObject({
        code: 'ACCOUNT_NOT_ACTIVATED',
      });
      expect(authorize(pendingViewer, 'admin:access')).toMatchObject({
        code: 'ACCOUNT_NOT_ACTIVATED',
      });
    });
  });

  describe('Dish admin-only fields (chefId & isFeatured)', () => {
    it('allows ADMIN to set or change chefId and isFeatured', () => {
      expect(checkDishAdminFields(admin, { chefId: 'chef-1', isFeatured: true })).toBeNull();
      expect(
        checkDishAdminFields(
          admin,
          { chefId: 'chef-2', isFeatured: false },
          { chefId: 'chef-1', isFeatured: true },
        ),
      ).toBeNull();
    });

    it('denies STAFF from setting chefId or isFeatured on create', () => {
      expect(checkDishAdminFields(staffA, { chefId: null, isFeatured: false })).toBeNull();
      expect(checkDishAdminFields(staffA, { chefId: 'chef-1', isFeatured: false })).toMatchObject({
        code: 'FORBIDDEN',
        fields: { chefId: expect.any(String) },
      });
      expect(checkDishAdminFields(staffA, { chefId: null, isFeatured: true })).toMatchObject({
        code: 'FORBIDDEN',
        fields: { isFeatured: expect.any(String) },
      });
    });

    it('allows STAFF to keep existing chefId/isFeatured unchanged, but denies changing them', () => {
      const existing = { chefId: 'chef-1', isFeatured: true };
      expect(checkDishAdminFields(staffA, { chefId: 'chef-1', isFeatured: true }, existing)).toBeNull();
      expect(
        checkDishAdminFields(staffA, { chefId: 'chef-2', isFeatured: true }, existing),
      ).toMatchObject({
        code: 'FORBIDDEN',
        fields: { chefId: expect.any(String) },
      });
      expect(
        checkDishAdminFields(staffA, { chefId: 'chef-1', isFeatured: false }, existing),
      ).toMatchObject({
        code: 'FORBIDDEN',
        fields: { isFeatured: expect.any(String) },
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
        canDelete: false,
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
