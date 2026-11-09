import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/resources';
import { useAuth } from '../auth/AuthProvider';
import { FormError } from '../components/FieldError';

const RESEND_COOLDOWN_SECONDS = 60;
const REDIRECT_DELAY_MS = 2500;

type Phase = 'verifying' | 'code' | 'ready' | 'success' | 'error';

/** Maps raw GoTrue/API errors into user-friendly Vietnamese messages. */
function authErrorToMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  if (/not found/i.test(raw)) {
    return 'Mã không đúng hoặc email không khớp. Vui lòng kiểm tra lại hoặc gửi lại mã.';
  }
  if (/otp.?expired|invalid/i.test(raw)) {
    return 'Mã đã hết hạn hoặc không còn hiệu lực. Vui lòng gửi lại yêu cầu.';
  }
  if (/over_email_send_rate_limit|too many|rate/i.test(raw)) {
    return 'Bạn vừa gửi yêu cầu gần đây. Vui lòng đợi một phút rồi thử lại.';
  }
  if (/already been used|revoked/i.test(raw)) {
    return 'Liên kết đã được sử dụng hoặc không còn hợp lệ. Bạn có thể nhập mã 6 số trong email.';
  }
  return raw || fallback;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.55 5.2 1.4M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.55-5.2-1.4" />
      <path d="M4 4l16 16" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

/**
 * Landing page for the "recovery" email. Two independent ways in:
 * - Recovery link: `?token_hash=…&type=recovery` → verified automatically via
 *   POST /api/auth/callback, which also establishes the real session cookie.
 * - 6-digit OTP: user types the code from the same email (works cross-device).
 * Both paths must produce a live session before the password form is shown.
 */
export default function ResetPassword() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const hasToken = Boolean(params.get('token_hash') || params.get('code'));
  const stateEmail = ((location.state ?? {}) as { email?: string }).email ?? '';

  const [phase, setPhase] = useState<Phase>(hasToken ? 'verifying' : user ? 'ready' : 'code');
  const [email, setEmail] = useState(stateEmail);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cooldown, setCooldown] = useState(stateEmail ? RESEND_COOLDOWN_SECONDS : 0);

  // StrictMode may double-run effects; the recovery token can only be used once.
  const verifiedRef = useRef(false);
  useEffect(() => {
    if (!hasToken || verifiedRef.current) return;
    verifiedRef.current = true;
    authApi
      .callback(`?${params.toString()}`)
      .then(async (r) => {
        await refresh();
        setPhase(r.user ? 'ready' : 'error');
      })
      .catch(() => {
        setPhase('error');
      });
    // Runs once per mount; `verifiedRef` blocks a second verify attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (phase !== 'success') return;
    const timer = window.setTimeout(() => {
      navigate('/login', {
        replace: true,
        state: {
          verifiedEmail: email || undefined,
          message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập bằng mật khẩu mới.',
        },
      });
    }, REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, email, navigate]);

  function toCodePhase() {
    setError(null);
    setInfo(null);
    setPhase('code');
  }

  async function onResend() {
    if (resending || cooldown > 0 || busy) return;
    if (!email.trim()) {
      setError('Nhập địa chỉ email trước khi gửi lại mã.');
      return;
    }
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      await authApi.forgotPassword(email.trim());
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo('Đã gửi lại liên kết và mã 6 số vào hộp thư của bạn (kiểm tra cả thư rác).');
    } catch (err) {
      setError(authErrorToMessage(err, 'Không gửi được yêu cầu. Vui lòng thử lại sau ít phút.'));
    } finally {
      setResending(false);
    }
  }

  async function onCodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await authApi.verifyRecovery(email.trim(), otp.trim());
      await refresh();
      setPhase(r.user ? 'ready' : 'error');
    } catch (err) {
      setError(authErrorToMessage(err, 'Mã không đúng hoặc đã hết hạn. Vui lòng gửi lại yêu cầu.'));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) {
      setError('Mật khẩu tối thiểu 6 ký tự.');
      return;
    }
    if (password.length > 72) {
      setError('Mật khẩu tối đa 72 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.resetPassword({ password, confirmPassword });
      // End the recovery session (and any others) before announcing success.
      await signOut().catch(() => {});
      setPhase('success');
    } catch (err) {
      setError(authErrorToMessage(err, 'Đổi mật khẩu thất bại. Vui lòng thử lại.'));
      setBusy(false);
    }
  }

  if (phase === 'verifying') {
    return (
      <div className="auth-split">
        <div className="auth-aside">
          <div>
            <div className="eyebrow">Team13 Restaurant</div>
            <p className="auth-quote">Đang xác thực liên kết…</p>
          </div>
        </div>
        <div className="auth-body">
          <p className="lead">Vui lòng đợi trong giây lát.</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="auth-split">
        <div className="auth-aside">
          <div>
            <div className="eyebrow">Team13 Restaurant</div>
            <p className="auth-quote">Liên kết không hợp lệ.</p>
          </div>
        </div>
        <div className="auth-body">
          <p className="lead">
            Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Bạn có thể nhập mã 6 số trong
            email, hoặc yêu cầu một liên kết mới.
          </p>
          <button type="button" className="btn btn-solid btn-lg" onClick={toCodePhase}>
            Nhập mã 6 số
          </button>
          <div className="auth-alt">
            Gửi lại liên kết? <Link to="/forgot-password">Quên mật khẩu</Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="auth-split">
        <div className="auth-aside">
          <div>
            <div className="eyebrow">Team13 Restaurant</div>
            <p className="auth-quote">Mật khẩu của bạn đã sẵn sàng.</p>
          </div>
          <div className="auth-aside-foot">
            <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
            <span>1900 6868</span>
          </div>
        </div>
        <div className="auth-body">
          <h1>Đổi mật khẩu thành công</h1>
          <div className="alert">
            <b>Thành công</b>
            <span>Mọi phiên đăng nhập cũ đã bị thu hồi. Vui lòng đăng nhập bằng mật khẩu mới.</span>
          </div>
          <button
            type="button"
            className="btn btn-solid btn-lg"
            onClick={() =>
              navigate('/login', {
                replace: true,
                state: {
                  verifiedEmail: email || undefined,
                  message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập bằng mật khẩu mới.',
                },
              })
            }
          >
            Đăng nhập ngay
          </button>
          <p className="field-hint" style={{ marginTop: 12 }}>
            Đang chuyển về trang đăng nhập sau {REDIRECT_DELAY_MS / 1000} giây…
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'code') {
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
          <h1>Nhập mã xác nhận</h1>
          <p className="lead">
            Chúng tôi đã gửi <b>liên kết và mã 6 số</b> đến{' '}
            {email ? <b>{email}</b> : 'email của bạn'}. Nhập mã để tiếp tục nếu bạn không nhấn được
            liên kết.
          </p>

          {info && (
            <div className="alert info">
              <b>Đã gửi lại</b>
              <span>{info}</span>
            </div>
          )}
          <FormError message={error} />

          <form onSubmit={onCodeSubmit}>
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
                disabled={busy || resending}
              />
            </div>

            <div className="field">
              <label htmlFor="otp">
                Mã 6 số <span className="req">*</span>
              </label>
              <input
                id="otp"
                type="text"
                required
                minLength={6}
                maxLength={6}
                inputMode="numeric"
                pattern="^\d{6}$"
                autoComplete="one-time-code"
                className="otp-input"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                disabled={busy || resending}
              />
            </div>

            <button
              type="submit"
              className="btn btn-solid btn-lg"
              disabled={busy || resending || otp.length !== 6 || !email.trim()}
            >
              {busy ? 'Đang xác minh…' : 'Xác nhận mã'}
            </button>
          </form>

          <div className="otp-actions">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={onResend}
              disabled={resending || cooldown > 0 || busy}
            >
              {resending
                ? 'Đang gửi lại…'
                : cooldown > 0
                  ? `Gửi lại mã (${cooldown}s)`
                  : 'Gửi lại mã'}
            </button>
          </div>

          <div className="auth-alt">
            Mã hết hạn? <Link to="/forgot-password">Gửi lại yêu cầu</Link> ·{' '}
            <Link to="/login">Đăng nhập</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-split">
      <div className="auth-aside">
        <div>
          <div className="eyebrow">Team13 Restaurant</div>
          <p className="auth-quote">Chọn mật khẩu mới cho tài khoản của bạn.</p>
        </div>
        <div className="auth-aside-foot">
          <span>123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
          <span>Mở cửa 09:00 – 22:00</span>
          <span>1900 6868</span>
        </div>
      </div>

      <div className="auth-body">
        <h1>Đặt lại mật khẩu</h1>
        <p className="lead">Nhập mật khẩu mới của bạn, tối thiểu 6 ký tự.</p>

        <FormError message={error} />

        <form onSubmit={onSubmit}>
          <div className="field field-with-eye">
            <label htmlFor="password">
              Mật khẩu mới <span className="req">*</span>
            </label>
            <div className="eye-box">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                maxLength={72}
                autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="field-eye"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                disabled={busy}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          <div className="field field-with-eye">
            <label htmlFor="confirmPassword">
              Nhập lại mật khẩu <span className="req">*</span>
            </label>
            <div className="eye-box">
              <input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={6}
                maxLength={72}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="field-eye"
                aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-pressed={showConfirm}
                onClick={() => setShowConfirm((v) => !v)}
                disabled={busy}
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
          </button>
        </form>

        <div className="auth-alt">
          <Link
            to="/login"
            onClick={async (e) => {
              e.preventDefault();
              // Leaving the reset page abandons the recovery session sign-in.
              await signOut().catch(() => {});
              navigate('/login', { replace: true });
            }}
          >
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}