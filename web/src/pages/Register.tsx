import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/resources';
import { ApiError, HttpError, type ApiFieldErrors } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { FormError } from '../components/FieldError';

export default function Register() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={canAccessAdmin(user) ? '/admin/dishes' : '/'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.register({
        displayName: displayName.trim() || undefined,
        email,
        password,
        confirmPassword: confirm,
      });
      if (result.requiresEmailConfirmation) {
        setSent(true);
        return;
      }
      await refresh();
      const target = canAccessAdmin(result.user)
        ? (result.redirectTo ?? '/admin/dishes')
        : '/';
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields as ApiFieldErrors | undefined;
        setError(fields?.['confirmPassword'] ?? fields?.['email'] ?? err.message);
      } else if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError('Đăng ký thất bại.');
      }
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-split">
        <div className="auth-aside">
          <div>
            <div className="eyebrow">Team13 Restaurant</div>
            <p className="auth-quote">Kiểm tra hộp thư của bạn.</p>
          </div>
          <div className="auth-aside-foot">
            <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
            <span>1900 6868</span>
          </div>
        </div>

        <div className="auth-body">
          <h1>Kiểm tra email</h1>
          <p className="lead">
            Chúng tôi đã gửi email xác nhận tới <b>{email}</b>. Bấm liên kết trong email để kích hoạt
            tài khoản rồi đăng nhập.
          </p>
          <Link className="btn btn-solid btn-lg" to="/login">
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-split">
      <div className="auth-aside">
        <div>
          <div className="eyebrow">Team13 Restaurant</div>
          <p className="auth-quote">Thành viên mới, ưu đãi theo mùa.</p>
        </div>
        <div className="auth-aside-foot">
          <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
          <span>Mở cửa 09:00 – 22:00</span>
          <span>1900 6868</span>
        </div>
      </div>

      <div className="auth-body">
        <h1>Tạo tài khoản</h1>
        <p className="lead">Đăng ký thành viên để đặt bàn và nhận ưu đãi theo mùa.</p>

        <FormError message={error} />

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="displayName">Tên hiển thị</label>
            <input
              id="displayName"
              type="text"
              placeholder="Tên của bạn"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

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
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">
              Nhập lại mật khẩu <span className="req">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </form>

        <div className="auth-alt">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
      </div>
    </div>
  );
}
