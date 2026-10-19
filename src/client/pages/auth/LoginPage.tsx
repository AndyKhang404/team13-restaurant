import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { useFlash } from '../../context/FlashContext.js';

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get('next') || '';
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const { setFlash } = useFlash();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await apiFetch<{
        redirectTo: string;
        message: string;
      }>('/auth/login', {
        method: 'POST',
        body: { email, password, next: nextParam },
      });

      await refreshAuth();
      setFlash({ type: 'success', message: res.message || 'Đăng nhập thành công.' });
      navigate(res.redirectTo || '/');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.fields) {
          setFieldErrors(err.fields);
        }
      } else {
        setFormError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split">
      <div className="auth-aside">
        <div>
          <div className="eyebrow">Team13 Restaurant</div>
          <p className="auth-quote">Nhà hàng Việt, nấu theo mùa.</p>
        </div>
        <div className="auth-aside-foot">
          <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
          <span>Mở cửa 09:00 — 22:00</span>
          <span>1900 6868</span>
        </div>
      </div>

      <div className="auth-body">
        <h1>Đăng nhập</h1>
        <p className="lead">Đăng nhập để đặt bàn và theo dõi đơn của bạn.</p>

        {formError ? (
          <div className="alert error">
            <b>Lỗi</b> <span>{formError}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">
              Email <span className="req">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="ban@example.com"
              className={fieldErrors['email'] ? 'invalid' : ''}
            />
            {fieldErrors['email'] ? (
              <span className="err">{fieldErrors['email']}</span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="password">
              Mật khẩu <span className="req">*</span>
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={fieldErrors['password'] ? 'invalid' : ''}
            />
            {fieldErrors['password'] ? (
              <span className="err">{fieldErrors['password']}</span>
            ) : null}
          </div>

          <button type="submit" className="btn btn-solid btn-lg" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-alt">
          Chưa có tài khoản? <Link to="/register">Tạo tài khoản</Link>
        </div>
      </div>
    </div>
  );
};
