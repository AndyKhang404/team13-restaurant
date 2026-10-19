import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { FlashBanner } from '../shared/FlashBanner.js';
import { can } from '../../lib/permissions.js';
import { useLayoutStylesheet } from '../../lib/useLayoutStylesheet.js';

export const PublicLayout: React.FC = () => {
  useLayoutStylesheet(['/css/style.css']);
  const { user, logout } = useAuth();
  const { toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async (e: React.FormEvent) => {
    e.preventDefault();
    await logout();
    navigate('/');
  };

  return (
    <div className="page">
      <header className="site-header">
        <div className="wrap nav">
          <input
            type="checkbox"
            id="nav-toggle"
            className="nav-toggle"
            aria-label="Mở menu"
            checked={navOpen}
            onChange={(e) => setNavOpen(e.target.checked)}
          />
          <Link className="brand" to="/" onClick={() => setNavOpen(false)}>
            Team13 <i>Restaurant</i>
          </Link>

          <nav className="nav-links">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setNavOpen(false)}
            >
              Trang chủ
            </NavLink>
            <NavLink
              to="/menu"
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setNavOpen(false)}
            >
              Thực đơn
            </NavLink>
            {user && can(user, 'admin:access') ? (
              <NavLink
                to="/admin"
                className="nav-mobile-admin"
                onClick={() => setNavOpen(false)}
              >
                Quản trị
              </NavLink>
            ) : null}
          </nav>

          <div className="nav-cta">
            <button
              type="button"
              className="theme-switch"
              onClick={toggleTheme}
              title="Sáng / Tối"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label="Chuyển chế độ sáng tối"
            />
            {user ? (
              <>
                {can(user, 'admin:access') ? (
                  <Link className="btn btn-quiet nav-admin-btn" to="/admin">
                    Quản trị
                  </Link>
                ) : null}
                <form onSubmit={handleLogout} className="inline-form" style={{ display: 'inline' }}>
                  <button type="submit" className="btn btn-solid">
                    Đăng xuất
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link className="btn btn-quiet" to="/login">
                  Đăng nhập
                </Link>
                <Link className="btn btn-solid nav-cta-menu" to="/menu">
                  Xem thực đơn
                </Link>
              </>
            )}
          </div>

          <label
            htmlFor="nav-toggle"
            className="nav-burger"
            aria-hidden="true"
            onClick={() => setNavOpen((prev) => !prev)}
          >
            <span></span>
            <span></span>
            <span></span>
          </label>
        </div>
      </header>

      <main className="wrap">
        <FlashBanner />
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
  );
};
