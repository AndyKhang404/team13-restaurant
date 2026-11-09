import type { AuthUser } from '../lib/types';

/**
 * Slide 30: "Mọi tài khoản đã kích hoạt dùng được CRUD; role chưa dùng để phân quyền ở bài này"
 * Slide 31: "Route guard cho /admin/*; ẩn nút theo trạng thái đăng nhập chỉ là giao diện"
 * Any authenticated user has access in Bài 1 (RBAC/ABAC is in Bài 2).
 */
export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  return !!user;
}
