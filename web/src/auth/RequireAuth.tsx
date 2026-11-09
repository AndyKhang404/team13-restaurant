import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/**
 * Slide 30 & 31: "Mọi tài khoản đã kích hoạt dùng được CRUD; role chưa dùng để phân quyền ở bài này"
 * "Route guard cho /admin/*; ẩn nút theo trạng thái đăng nhập chỉ là giao diện"
 * Guards the /admin/* routes by authentication.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="empty">Đang tải…</div>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
