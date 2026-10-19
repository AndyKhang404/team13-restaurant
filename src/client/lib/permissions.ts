export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';

export type Permission =
  | 'admin:access'
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
  ADMIN: new Set<Permission>(['admin:access', ...CONTENT_PERMISSIONS, 'user:manage']),
  STAFF: new Set<Permission>(['admin:access', ...CONTENT_PERMISSIONS]),
  CUSTOMER: new Set<Permission>(),
};

export function can(
  user: { role: Role | string } | null | undefined,
  permission: Permission,
): boolean {
  if (!user || !user.role) return false;
  const role = user.role as Role;
  const set = ROLE_PERMISSIONS[role];
  return set ? set.has(permission) : false;
}
