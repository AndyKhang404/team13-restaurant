import type { AuthUser } from '../lib/types';

/**
 * RBAC helpers for frontend route guards and UI display.
 * ADMIN has full access (admin panel, content CRUD, user management).
 * STAFF has admin panel and content CRUD access.
 * VIEWER has public/read-only access only.
 */
export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.role === 'STAFF';
}

export function canManageUsers(user: AuthUser | null | undefined): boolean {
  return user?.role === 'ADMIN';
}

export function canManageContent(user: AuthUser | null | undefined): boolean {
  return user?.role === 'ADMIN' || user?.role === 'STAFF';
}

