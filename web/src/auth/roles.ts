import type { AuthUser, RowPermissions } from '../lib/types';

/**
 * RBAC + ABAC helpers for frontend route guards and UI display.
 * ADMIN has full access (admin panel, content CRUD, user management).
 * STAFF has admin panel and content creation, and may edit/delete/restore only rows they own (enforced by server ABAC `permissions`).
 * VIEWER has public/read-only access only.
 * SUSPENDED accounts are denied access regardless of role.
 */
export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  if (!user || user.status === 'SUSPENDED') return false;
  return user.role === 'ADMIN' || user.role === 'STAFF';
}

export function canManageUsers(user: AuthUser | null | undefined): boolean {
  if (!user || user.status === 'SUSPENDED') return false;
  return user.role === 'ADMIN';
}

export function canManageContent(user: AuthUser | null | undefined): boolean {
  if (!user || user.status === 'SUSPENDED') return false;
  return user.role === 'ADMIN' || user.role === 'STAFF';
}

export function canEditRow(
  row: { permissions?: RowPermissions } | null | undefined,
  user: AuthUser | null | undefined,
): boolean {
  if (!row) return false;
  if (row.permissions) return row.permissions.canUpdate;
  return canManageContent(user);
}

export function canDeleteRow(
  row: { permissions?: RowPermissions } | null | undefined,
  user: AuthUser | null | undefined,
): boolean {
  if (!row) return false;
  if (row.permissions) return row.permissions.canDelete;
  return canManageContent(user);
}

export const NOT_OWNER_TOOLTIP = 'Bạn chỉ có thể chỉnh sửa hoặc xóa nội dung do chính mình tạo.';

