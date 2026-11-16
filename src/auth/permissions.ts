import { Role } from '../generated/prisma/enums.js';

/**
 * RBAC base gate: roles map to coarse permissions here; code checks permissions, never role names.
 * Resource-level and account-status ABAC rules restrict on top of RBAC in `src/auth/policy.ts`.
 * Add a permission to the union, then grant it to roles below.
 */
export type Permission =
  | 'admin:access'
  | 'dish:create'
  | 'dish:update'
  | 'dish:delete'
  | 'chef:create'
  | 'chef:update'
  | 'chef:delete'
  | 'ingredient:create'
  | 'ingredient:update'
  | 'ingredient:delete'
  | 'user:manage';

const STAFF_CONTENT_PERMISSIONS: Permission[] = [
  'dish:create',
  'dish:update',
  'chef:create',
  'chef:update',
  'ingredient:create',
  'ingredient:update',
];

const DELETE_PERMISSIONS: Permission[] = [
  'dish:delete',
  'chef:delete',
  'ingredient:delete',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [Role.ADMIN]: new Set<Permission>([
    'admin:access',
    ...STAFF_CONTENT_PERMISSIONS,
    ...DELETE_PERMISSIONS,
    'user:manage',
  ]),
  // STAFF (Editor) can access admin panel and create/update/restore own content, but cannot delete or manage users.
  [Role.STAFF]: new Set<Permission>(['admin:access', ...STAFF_CONTENT_PERMISSIONS]),
  [Role.VIEWER]: new Set<Permission>(),
};

export function can(user: { role: Role } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.has(permission) ?? false;
}
