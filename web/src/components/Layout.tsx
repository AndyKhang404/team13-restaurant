import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { ThemeSwitch, ThemeToggle, useTheme } from './ThemeSwitch';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'active' : undefined;

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { dark, toggle } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  async function onLogout() {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    try {
      await signOut();
      navigate('/');
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }

  return (
    <>
      <ThemeToggle dark={dark} onToggle={toggle} />
      <div className="page">
        <header className="site-header">
          <div className="wrap nav">
            <input
              type="checkbox"
              id="nav-toggle"
              className="nav-toggle"
              checked={navOpen}
              onChange={(e) => setNavOpen(e.target.checked)}
              aria-label="Mở menu"
            />
            <Link className="brand" to="/">
              Team13 <i>Restaurant</i>
            </Link>
            <nav className="nav-links">
              <NavLink to="/" end className={navLinkClass}>
                Trang chủ
              </NavLink>
              <NavLink to="/dishes" className={navLinkClass}>
                Thực đơn
              </NavLink>
              {canAccessAdmin(user) ? (
                <Link to="/admin" className="nav-mobile-admin">
                  Quản trị
                </Link>
              ) : null}
            </nav>
            <div className="nav-cta">
              <ThemeSwitch />
              {canAccessAdmin(user) ? (
                <Link className="btn btn-quiet nav-admin-btn" to="/admin">
                  Quản trị
                </Link>
              ) : null}
              {user ? (
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => void onLogout()}
                  disabled={loggingOut}
                  aria-busy={loggingOut}
                >
                  {loggingOut ? 'Đang xuất…' : 'Đăng xuất'}
                </button>
              ) : (
                <>
                  <Link className="btn btn-quiet" to="/login">
                    Đăng nhập
                  </Link>
                  <Link className="btn btn-solid nav-cta-menu" to="/dishes">
                    Xem thực đơn
                  </Link>
                </>
              )}
            </div>
            <label htmlFor="nav-toggle" className="nav-burger" aria-hidden="true">
              <span />
              <span />
              <span />
            </label>
          </div>
        </header>

        <main className="wrap">
          <Outlet />
        </main>

        <footer className="site-footer">
          <div className="wrap">
            <span className="foot-brand">
              Team13 <i>Restaurant</i>
            </span>
            <div className="foot-grid">
              <span>Đồ án PTUDW — ĐH Khoa học Tự nhiên</span>
              <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
              <span>Mở cửa 09:00 — 22:00</span>
              <span>Hotline 1900 6868</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
