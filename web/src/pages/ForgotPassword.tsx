import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/resources';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { FormError } from '../components/FieldError';

const SENT_REDIRECT_DELAY_MS = 1200;

export default function ForgotPassword() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  // Anti-enumeration: after accepting the request, move on to the verify page
  // regardless of whether the address exists — never reveal the outcome here.
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => {
      navigate('/reset-password', { state: { email: sentEmail }, replace: true });
    }, SENT_REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [sent, sentEmail, navigate]);

  // Always disabled state: prevent double submit while waiting for redirect.
  if (user && !sent) {
    return <Navigate to={canAccessAdmin(user) ? '/admin/dishes' : '/'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const clean = email.trim();
      await authApi.forgotPassword(clean);
      setSentEmail(clean);
      setSent(true);
      // The effect above handles the redirect; `busy` stays true so the form
      // cannot be re-submitted while the redirect countdown runs.
    } catch (err) {
      // A stuck request must never freeze the button on its spinner.
      setError(err instanceof Error ? err.message : 'Không gửi được yêu cầu. Vui lòng thử lại.');
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
        <h1>Quên mật khẩu</h1>
        <p className="lead">
          Nhập email của bạn, chúng tôi sẽ gửi liên kết và mã 6 số để đặt lại mật khẩu.
        </p>

        {sent ? (
          <>
            <div className="alert info">
              <b>Đã gửi yêu cầu</b>
              <span>
                Nếu email tồn tại trong hệ thống, liên kết và mã 6 số đã được gửi đến hộp thư của
                bạn. Đang chuyển đến trang xác nhận…
              </span>
            </div>
            <button type="button" className="btn btn-solid btn-lg" disabled>
              Đang chuyển trang…
            </button>
          </>
        ) : (
          <>
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
                  disabled={busy}
                />
              </div>

              <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
                {busy ? 'Đang gửi…' : 'Gửi yêu cầu đặt lại mật khẩu'}
              </button>
            </form>
          </>
        )}

        <div className="auth-alt">
          Đã nhớ lại mật khẩu? <Link to="/login">Đăng nhập</Link>
        </div>
      </div>
    </div>
  );
}

