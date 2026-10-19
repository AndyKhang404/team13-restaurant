import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { canAccessAdmin } from './roles';

/** Guards the /admin/* routes by session and admin role. The API still enforces RBAC. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (loading) return <div className="empty">Đang tải…</div>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!canAccessAdmin(user)) {
    async function onSignOut() {
      if (signingOut) return;
      setSigningOut(true);
      try {
        await signOut();
      } catch {
        /* signOut clears local state even when the API call fails */
      } finally {
        navigate('/login', { replace: true });
      }
    }

    return (
      <div className="error-page">
        <div className="code">403</div>
        <h1>Không có quyền truy cập</h1>
        <p>
          Tài khoản <b>{user.email}</b> không có quyền vào khu quản trị. Chỉ tài khoản ADMIN hoặc
          STAFF mới được phép truy cập.
        </p>
        <div className="actions-row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-solid" to="/">
            Về trang chủ
          </Link>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {signingOut ? 'Đang xuất…' : 'Đăng xuất'}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
