import type { AuthUser, RowPermissions } from '../lib/types';

/**
 * RBAC + ABAC helpers for frontend route guards and UI display.
 * ADMIN has full access (admin panel, content CRUD + delete, user management).
 * STAFF (Editor) has admin panel and content creation, and may edit/restore only rows they own (cannot delete).
 * VIEWER has public/read-only access only.
 * SUSPENDED and PENDING accounts are denied access regardless of role.
 */
function isActiveAccount(user: AuthUser | null | undefined): user is AuthUser {
  return Boolean(user && user.status !== 'SUSPENDED' && user.status !== 'PENDING');
}

export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  if (!isActiveAccount(user)) return false;
  return user.role === 'ADMIN' || user.role === 'STAFF';
}

export function canManageUsers(user: AuthUser | null | undefined): boolean {
  if (!isActiveAccount(user)) return false;
  return user.role === 'ADMIN';
}

export function canManageContent(user: AuthUser | null | undefined): boolean {
  if (!isActiveAccount(user)) return false;
  return user.role === 'ADMIN' || user.role === 'STAFF';
}

export function canDeleteContent(user: AuthUser | null | undefined): boolean {
  if (!isActiveAccount(user)) return false;
  return user.role === 'ADMIN';
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
  return canDeleteContent(user);
}

export const NOT_OWNER_TOOLTIP = 'Bạn chỉ có thể chỉnh sửa nội dung do chính mình tạo.';
export const ADMIN_ONLY_DELETE_TOOLTIP = 'Chỉ quản trị viên mới có quyền xóa nội dung.';
export const ADMIN_ONLY_FIELD_TOOLTIP = 'Chỉ quản trị viên mới có quyền thay đổi trường này.';
