import type { AuthUser } from '../lib/types';

const ADMIN_ROLES: ReadonlySet<AuthUser['role']> = new Set(['ADMIN', 'STAFF']);

/** Roles allowed into the admin shell. The API still enforces RBAC. */
export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  return !!user && ADMIN_ROLES.has(user.role);
}
