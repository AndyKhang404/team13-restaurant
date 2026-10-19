import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { can, type Permission } from '../../lib/permissions.js';

interface RequireAuthProps {
  children: React.ReactNode;
  permission?: Permission;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children, permission }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', fontFamily: 'var(--mono)' }}>
        Đang tải thông tin xác thực...
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (permission && !can(user, permission)) {
    return (
      <div className="error-page" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div className="code">403</div>
        <h1>Không có quyền truy cập</h1>
        <p>Bạn không có quyền thực hiện thao tác này hoặc xem trang này.</p>
        <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
          <a className="btn btn-solid" href="/">Về trang chủ</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
