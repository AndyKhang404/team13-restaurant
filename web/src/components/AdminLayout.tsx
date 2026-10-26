import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ThemeSwitch, ThemeToggle, useTheme } from './ThemeSwitch';

function titleFor(pathname: string): string {
  if (pathname.includes('/chefs')) return 'Đầu bếp';
  if (pathname.includes('/ingredients')) return 'Nguyên liệu';
  if (pathname.includes('/dishes')) return 'Món ăn';
  if (pathname.includes('/users')) return 'Người dùng';
  return 'Quản trị';
}

const sideLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'side-link active' : 'side-link';

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { dark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const title = titleFor(location.pathname);
  const email = user?.email ?? '';
  const name = user?.displayName || email || 'Quản trị viên';

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const sidebar = sidebarRef.current;
      if (menuOpen && sidebar && !sidebar.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && menuOpen) setMenuOpen(false);
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

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
      <div className="shell">
        <aside className="sidebar" ref={sidebarRef}>
          <input
            type="checkbox"
            id="admin-nav-toggle"
            className="admin-nav-toggle"
            checked={menuOpen}
            onChange={(e) => setMenuOpen(e.target.checked)}
            aria-label="Mở menu quản trị"
          />
          <div className="side-bar">
            <Link className="side-brand" to="/admin">
              Team13 <i>Admin</i>
            </Link>
            <label htmlFor="admin-nav-toggle" className="side-toggle" aria-label="Menu quản trị">
              <span className="side-toggle-text">Menu</span>
              <span className="side-burger">
                <span />
                <span />
                <span />
              </span>
            </label>
          </div>
          <div className="side-menu">
            <div className="side-label">Quản trị dữ liệu</div>
            <NavLink to="/admin/dishes" className={sideLinkClass}>
              <span className="n">01</span> Món ăn
            </NavLink>
            <NavLink to="/admin/chefs" className={sideLinkClass}>
              <span className="n">02</span> Đầu bếp
            </NavLink>
            <NavLink to="/admin/ingredients" className={sideLinkClass}>
              <span className="n">03</span> Nguyên liệu
            </NavLink>
            {user?.role === 'ADMIN' && (
              <NavLink to="/admin/users" className={sideLinkClass}>
                <span className="n">04</span> Người dùng
              </NavLink>
            )}
            <div className="side-label">Khác</div>
            <Link className="side-link" to="/">
              <span className="n">05</span> Trang người dùng
            </Link>

            <div className="side-foot">
              <div className="userbox">
                <span className="avatar">T13</span>
                <div className="userbox-info">
                  <b className="userbox-name" title={name}>
                    {name}
                  </b>
                  <span className="userbox-email" title={email}>
                    {email}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="side-link"
                style={{
                  width: '100%',
                  border: 0,
                  background: 'none',
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: loggingOut ? 'not-allowed' : 'pointer',
                }}
                onClick={() => void onLogout()}
                disabled={loggingOut}
                aria-busy={loggingOut}
              >
                <span className="n">06</span> {loggingOut ? 'Đang xuất…' : 'Đăng xuất'}
              </button>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div>
              <div className="crumb">
                Quản trị / <b>{title}</b>
              </div>
              <h1>{title}</h1>
            </div>
            <div className="top-right">
              <ThemeSwitch />
              <span className="check" title={name}>
                {name}
              </span>
            </div>
          </div>

          <main className="content">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
