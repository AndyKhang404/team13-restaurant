import { Role } from '../generated/prisma/enums.js';

/**
 * RBAC: roles map to permissions here; code checks permissions, never role names.
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

const CONTENT_PERMISSIONS: Permission[] = [
  'dish:create',
  'dish:update',
  'dish:delete',
  'chef:create',
  'chef:update',
  'chef:delete',
  'ingredient:create',
  'ingredient:update',
  'ingredient:delete',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [Role.ADMIN]: new Set<Permission>(['admin:access', ...CONTENT_PERMISSIONS, 'user:manage']),
  // STAFF can access admin panel and manage content (dishes, chefs, ingredients), but cannot manage users.
  [Role.STAFF]: new Set<Permission>(['admin:access', ...CONTENT_PERMISSIONS]),
  [Role.CUSTOMER]: new Set<Permission>(),
};

export function can(user: { role: Role } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.has(permission) ?? false;
}
