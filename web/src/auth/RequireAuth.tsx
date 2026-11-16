import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

import { canAccessAdmin } from './roles';

interface RequireAuthProps {
  children: ReactNode;
  adminOnly?: boolean;
}

/**
 * Route guard enforcing authentication and role-based access control.
 * Re-directs unauthenticated visitors to /login, and non-admin/staff users to / if adminOnly is set.
 */
export function RequireAuth({ children, adminOnly }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="empty">Đang tải…</div>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly && !canAccessAdmin(user)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
