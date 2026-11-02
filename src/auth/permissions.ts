import { Role } from '../generated/prisma/enums.js';

/**
 * RBAC: roles map to permissions here; code checks permissions, never role names.
 * Add a permission to the union, then grant it to roles below.
 */
export type Permission =
  | 'admin:access'
  | 'content:view'
  | 'dish:create'
  | 'dish:update'
  | 'dish:delete'
  | 'dish:restore'
  | 'chef:create'
  | 'chef:update'
  | 'chef:delete'
  | 'chef:restore'
  | 'ingredient:create'
  | 'ingredient:update'
  | 'ingredient:delete'
  | 'ingredient:restore'
  | 'user:manage';

const CONTENT_PERMISSIONS: Permission[] = [
  'dish:create',
  'dish:update',
  'dish:delete',
  'dish:restore',
  'chef:create',
  'chef:update',
  'chef:delete',
  'chef:restore',
  'ingredient:create',
  'ingredient:update',
  'ingredient:delete',
  'ingredient:restore',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [Role.ADMIN]: new Set<Permission>([
    'admin:access',
    'content:view',
    ...CONTENT_PERMISSIONS,
    'user:manage',
  ]),
  // STAFF can access the admin panel and manage content, but cannot manage users.
  [Role.STAFF]: new Set<Permission>(['admin:access', 'content:view', ...CONTENT_PERMISSIONS]),
  // VIEWER can read content (list/detail) but cannot create, edit or delete it.
  [Role.VIEWER]: new Set<Permission>(['admin:access', 'content:view']),
};

export function can(user: { role: Role } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.has(permission) ?? false;
}
