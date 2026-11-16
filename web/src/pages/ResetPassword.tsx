import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, HttpError } from '../lib/api';
import { authApi } from '../lib/resources';
import { useAuth } from '../auth/AuthProvider';
import { FormError } from '../components/FieldError';
import { AuthAside, PasswordField, OtpField } from '../components/auth';

const RESEND_COOLDOWN_SECONDS = 60;
const REDIRECT_DELAY_MS = 2500;

type Phase = 'code' | 'ready' | 'success' | 'error';

/** Maps raw GoTrue/API errors into user-friendly Vietnamese messages. */
function authErrorToMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : '';
  if (/INVALID_RESET_TOKEN|not found|invalid|expired/i.test(raw)) {
    return 'Liên kết hoặc mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.';
  }
  if (/over_email_send_rate_limit|too many|rate/i.test(raw)) {
    return 'Bạn vừa gửi yêu cầu gần đây. Vui lòng đợi một phút rồi thử lại.';
  }
  if (err instanceof ApiError || err instanceof HttpError) return err.message;
  return fallback;
}

/**
 * Slide 18 & 29:
 * - Email contains a link to the web reset page (e.g. /reset-password?token=... or code / token_hash).
 * - Opening the page ONLY renders the form. The token is NEVER consumed on page load!
 * - Token is only consumed when the user submits the reset password form (POST /api/auth/reset).
 * - Token errors return HTTP 200 INVALID_RESET_TOKEN.
 */
export default function ResetPassword() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const urlToken = params.get('token') || params.get('token_hash') || params.get('code');
  const hasToken = Boolean(urlToken);
  // The email never appears in the URL: it arrives via navigation state
  // (set by ForgotPassword) and is mirrored into sessionStorage so a refresh
  // does not lose it.
  const stateEmail =
    ((location.state ?? {}) as { email?: string }).email ??
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('recovery_email') : null) ??
    '';

  // Slide 18: Opening the page renders the form directly without consuming token
  const [phase, setPhase] = useState<Phase>(hasToken || user ? 'ready' : 'code');
  const [manualCodeMode, setManualCodeMode] = useState(false);
  const [email, setEmail] = useState(stateEmail);
  const [otp, setOtp] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(stateEmail ? RESEND_COOLDOWN_SECONDS : 0);

  const requiresCurrentPassword = Boolean(user) && !hasToken && !otp && !manualCodeMode;

  useEffect(() => {
    if (stateEmail) sessionStorage.setItem('recovery_email', stateEmail);
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
    if (loading || hasToken || manualCodeMode || !user) return;
    setPhase((current) => (current === 'code' ? 'ready' : current));
  }, [loading, hasToken, manualCodeMode, user]);

  useEffect(() => {
    if (phase !== 'success') return;
    sessionStorage.removeItem('recovery_email');
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
    setManualCodeMode(true);
    setPhase('code');
  }

  async function signOutAndNavigate(e: MouseEvent<HTMLAnchorElement>, to: string) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    if (user) {
      await signOut().catch(() => {});
    }
    navigate(to, { replace: true });
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

  function onCodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (otp.length !== 6) {
      setError('Mã xác nhận gồm đúng 6 chữ số.');
      return;
    }
    setError(null);
    // Proceed to ready phase with email and OTP; token is only consumed when password form is submitted!
    setPhase('ready');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (requiresCurrentPassword && !currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu tối thiểu 6 ký tự.');
      return;
    }
    if (password.length > 72) {
      setError('Mật khẩu tối đa 72 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Token is strictly consumed here on POST
      await authApi.resetPassword({
        password,
        confirmPassword,
        currentPassword: requiresCurrentPassword ? currentPassword : undefined,
        token: params.get('token') ?? undefined,
        token_hash: params.get('token_hash') ?? undefined,
        code: params.get('code') ?? undefined,
        email: email || undefined,
        otp: otp || undefined,
      });
      // End any remaining sessions before announcing success
      await signOut().catch(() => {});
      setPhase('success');
    } catch (err) {
      setError(authErrorToMessage(err, 'Đổi mật khẩu thất bại. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !hasToken) {
    return <div className="empty">Đang tải…</div>;
  }

  if (phase === 'error') {
    return (
      <div className="auth-split">
        <AuthAside quote="Liên kết không hợp lệ." />
        <div className="auth-body">
          <h1>Liên kết không hợp lệ</h1>
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
        <AuthAside quote="Mật khẩu của bạn đã sẵn sàng." />
        <div className="auth-body">
          <h1>Đổi mật khẩu thành công</h1>
          <div className="alert">
            <b>Thành công</b>
            <span>Các thiết bị khác đã được đăng xuất. Vui lòng đăng nhập bằng mật khẩu mới.</span>
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
    if (!email.trim()) {
      // No address known (deep link / cleared storage): send the user back one step.
      return (
        <div className="auth-split">
          <AuthAside quote="Kiểm tra hộp thư của bạn." />
          <div className="auth-body">
            <h1>Chưa có yêu cầu đặt lại mật khẩu</h1>
            <p className="lead">
              Bạn cần gửi yêu cầu trước để nhận liên kết và mã 6 số qua email.
            </p>
            <Link to="/forgot-password" className="btn btn-solid btn-lg" role="button">
              Gửi yêu cầu đặt lại mật khẩu
            </Link>
            <div className="auth-alt">
              <Link to="/login">Đăng nhập</Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="auth-split">
        <AuthAside quote="Kiểm tra hộp thư của bạn." />

        <div className="auth-body">
          <h1>Nhập mã xác nhận</h1>
          <p className="lead">
            Chúng tôi đã gửi <b>liên kết và mã 6 số</b> đến <b>{email}</b>. Nhập mã để tiếp tục nếu
            bạn không nhấn được liên kết.
          </p>

          {info && (
            <div className="alert info">
              <b>Đã gửi lại</b>
              <span>{info}</span>
            </div>
          )}
          <FormError message={error} />

          <form onSubmit={onCodeSubmit}>
            <OtpField
              id="otp"
              label="Mã 6 số"
              hint="Nhập mã gồm 6 chữ số được gửi tới hộp thư của bạn (kiểm tra cả thư mục Spam)."
              value={otp}
              onChange={setOtp}
              disabled={busy || resending}
            />

            <button
              type="submit"
              className="btn btn-solid btn-lg"
              disabled={busy || resending || otp.length !== 6}
            >
              Tiếp tục đặt lại mật khẩu
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
            <Link to="/login">Đăng nhập</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-split">
      <AuthAside quote="Chọn mật khẩu mới cho tài khoản của bạn." />

      <div className="auth-body">
        <h1>{requiresCurrentPassword ? 'Đổi mật khẩu' : 'Đặt lại mật khẩu'}</h1>
        <p className="lead">
          {requiresCurrentPassword
            ? 'Nhập mật khẩu hiện tại và mật khẩu mới của bạn.'
            : 'Nhập mật khẩu mới của bạn, tối thiểu 6 ký tự.'}
        </p>

        <FormError message={error} />

        <form onSubmit={onSubmit}>
          {requiresCurrentPassword ? (
            <PasswordField
              id="currentPassword"
              label="Mật khẩu hiện tại"
              required
              autoComplete="current-password"
              placeholder="Nhập mật khẩu hiện tại"
              value={currentPassword}
              onChange={setCurrentPassword}
              disabled={busy}
            />
          ) : null}

          <PasswordField
            id="password"
            label="Mật khẩu mới"
            required
            minLength={6}
            maxLength={72}
            autoComplete="new-password"
            placeholder="Tối thiểu 6 ký tự"
            value={password}
            onChange={setPassword}
            disabled={busy}
          />

          <PasswordField
            id="confirmPassword"
            label="Nhập lại mật khẩu"
            required
            minLength={6}
            maxLength={72}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            value={confirmPassword}
            onChange={setConfirmPassword}
            disabled={busy}
          />

          <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
          </button>
        </form>

        {requiresCurrentPassword ? (
          <div className="auth-alt">
            Quên mật khẩu hiện tại?{' '}
            <Link to="/forgot-password" onClick={(e) => void signOutAndNavigate(e, '/forgot-password')}>
              Đặt lại bằng email
            </Link>
          </div>
        ) : null}

        <div className="auth-alt">
          <Link to="/login" onClick={(e) => void signOutAndNavigate(e, '/login')}>
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
