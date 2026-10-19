import React, { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { FlashBanner } from '../shared/FlashBanner.js';
import { can } from '../../lib/permissions.js';
import { useLayoutStylesheet } from '../../lib/useLayoutStylesheet.js';

export const AdminLayout: React.FC = () => {
  useLayoutStylesheet(['/css/app.css', '/css/admin.css']);
  const { user, logout } = useAuth();
  const { toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile sidebar on route change or Escape
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleLogout = async (e: React.FormEvent) => {
    e.preventDefault();
    await logout();
    navigate('/login');
  };

  // Derive current page title for breadcrumb
  let title = 'Bảng điều khiển';
  if (location.pathname.startsWith('/admin/dishes')) title = 'Món ăn';
  else if (location.pathname.startsWith('/admin/chefs')) title = 'Đầu bếp';
  else if (location.pathname.startsWith('/admin/ingredients')) title = 'Kho nguyên liệu';
  else if (location.pathname.startsWith('/admin/users')) title = 'Người dùng';

  return (
    <div className="shell">
      <aside className="sidebar">
        <input
          type="checkbox"
          id="admin-nav-toggle"
          className="admin-nav-toggle"
          aria-label="Mở menu quản trị"
          checked={navOpen}
          onChange={(e) => setNavOpen(e.target.checked)}
        />
        <div className="side-bar">
          <Link className="side-brand" to="/admin">
            Team13 <i>Admin</i>
          </Link>
          <label
            htmlFor="admin-nav-toggle"
            className="side-toggle"
            aria-label="Menu quản trị"
            onClick={() => setNavOpen((prev) => !prev)}
          >
            <span className="side-toggle-text">Menu</span>
            <span className="side-burger">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </label>
        </div>

        <div className="side-menu">
          <div className="side-label">Quản trị dữ liệu</div>
          <NavLink
            to="/admin/dishes"
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`.trim()}
          >
            <span className="n">01</span> Món ăn
          </NavLink>
          <NavLink
            to="/admin/chefs"
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`.trim()}
          >
            <span className="n">02</span> Đầu bếp
          </NavLink>
          <NavLink
            to="/admin/ingredients"
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`.trim()}
          >
            <span className="n">03</span> Nguyên liệu
          </NavLink>
          {user && can(user, 'user:manage') ? (
            <NavLink
              to="/admin/users"
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`.trim()}
            >
              <span className="n">04</span> Người dùng
            </NavLink>
          ) : null}

          <div className="side-label">Khác</div>
          <Link className="side-link" to="/">
            <span className="n">05</span> Trang người dùng
          </Link>

          <div className="side-foot">
            <div className="userbox">
              <span className="avatar">T13</span>
              <div className="userbox-info">
                <b className="userbox-name" title={user?.displayName || 'Quản trị viên'}>
                  {user?.displayName || 'Quản trị viên'}
                </b>
                <span className="userbox-email" title={user?.email}>
                  {user?.email}
                </span>
              </div>
            </div>
            <form onSubmit={handleLogout}>
              <button
                type="submit"
                className="side-link"
                style={{
                  width: '100%',
                  border: 0,
                  background: 'none',
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span className="n">06</span> Đăng xuất
              </button>
            </form>
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
            <button
              type="button"
              className="theme-switch"
              onClick={toggleTheme}
              title="Sáng / Tối"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label="Chuyển chế độ sáng tối"
            />
            <span className="check" title={user?.displayName || user?.email}>
              {user?.displayName || user?.email}
            </span>
          </div>
        </div>

        <main className="content">
          <FlashBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
};
