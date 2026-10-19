import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { useFlash } from '../../context/FlashContext.js';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const { setFlash } = useFlash();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checkEmailSent, setCheckEmailSent] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Mật khẩu nhập lại không khớp' });
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch<{
        requiresEmailConfirmation: boolean;
        email: string;
        redirectTo?: string;
        message: string;
      }>('/auth/register', {
        method: 'POST',
        body: { displayName, email, password, confirmPassword },
      });

      if (res.requiresEmailConfirmation) {
        setCheckEmailSent(res.email);
      } else {
        await refreshAuth();
        setFlash({ type: 'success', message: res.message || 'Chào mừng! Tài khoản đã được tạo.' });
        navigate(res.redirectTo || '/');
      }
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

  if (checkEmailSent) {
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
            Chúng tôi đã gửi email xác nhận tới <b>{checkEmailSent}</b>. Bấm liên kết trong email để
            kích hoạt tài khoản rồi đăng nhập.
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
          <span>Mở cửa 09:00 — 22:00</span>
          <span>1900 6868</span>
        </div>
      </div>

      <div className="auth-body">
        <h1>Tạo tài khoản</h1>
        <p className="lead">Đăng ký thành viên để đặt bàn và nhận ưu đãi theo mùa.</p>

        {formError ? (
          <div className="alert error">
            <b>Lỗi</b> <span>{formError}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="displayName">Tên hiển thị</label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tên của bạn"
              className={fieldErrors['displayName'] ? 'invalid' : ''}
            />
            {fieldErrors['displayName'] ? (
              <span className="err">{fieldErrors['displayName']}</span>
            ) : null}
          </div>

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
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              className={fieldErrors['password'] ? 'invalid' : ''}
            />
            {fieldErrors['password'] ? (
              <span className="err">{fieldErrors['password']}</span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">
              Nhập lại mật khẩu <span className="req">*</span>
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              maxLength={72}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              className={fieldErrors['confirmPassword'] ? 'invalid' : ''}
            />
            {fieldErrors['confirmPassword'] ? (
              <span className="err">{fieldErrors['confirmPassword']}</span>
            ) : null}
          </div>

          <button type="submit" className="btn btn-solid btn-lg" disabled={loading}>
            {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
          </button>
        </form>

        <div className="auth-alt">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
      </div>
    </div>
  );
};
