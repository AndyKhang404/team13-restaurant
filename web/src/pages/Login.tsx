import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/resources';
import { ApiError, HttpError } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { FormError } from '../components/FieldError';

interface LocationState {
  from?: string;
}

export default function Login() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={canAccessAdmin(user) ? '/admin/dishes' : '/'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.login(email, password);
      await refresh();
      const target = canAccessAdmin(result.user)
        ? (state.from ?? result.redirectTo ?? '/admin/dishes')
        : '/';
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'EMAIL_NOT_CONFIRMED'
            ? 'Vui lòng xác nhận email trước khi đăng nhập.'
            : err.code === 'INVALID_CREDENTIALS'
              ? 'Email hoặc mật khẩu không đúng.'
              : err.message,
        );
      } else if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError('Đăng nhập thất bại.');
      }
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      <div className="auth-aside">
        <div>
          <div className="eyebrow">Team13 Restaurant</div>
          <p className="auth-quote">Nhà hàng Việt, nấu theo mùa.</p>
        </div>
        <div className="auth-aside-foot">
          <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
          <span>Mở cửa 09:00 – 22:00</span>
          <span>1900 6868</span>
        </div>
      </div>

      <div className="auth-body">
        <h1>Đăng nhập</h1>
        <p className="lead">Đăng nhập để đặt bàn và theo dõi đơn của bạn.</p>

        <FormError message={error} />

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">
              Email <span className="req">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="ban@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">
              Mật khẩu <span className="req">*</span>
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-alt">
          Chưa có tài khoản? <Link to="/register">Tạo tài khoản</Link>
        </div>
      </div>
    </div>
  );
}
