import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/resources';
import { ApiError, HttpError, type ApiFieldErrors } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { FormError } from '../components/FieldError';
import Recaptcha from '../components/Recaptcha';

interface RegisterLocationState {
  verifyEmail?: string;
  notice?: string;
}

const RESEND_COOLDOWN_SECONDS = 60;
const REDIRECT_DELAY_MS = 2500;

export default function Register() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const locState = (location.state ?? {}) as RegisterLocationState;

  const initialVerifyEmail =
    locState.verifyEmail ??
    (searchParams.get('verify') === '1' ? (searchParams.get('email') ?? '') : '');

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(initialVerifyEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(locState.notice ?? null);
  const [sent, setSent] = useState(Boolean(initialVerifyEmail));
  const [busy, setBusy] = useState(false);
  const [siteKey, setSiteKey] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    let active = true;
    authApi
      .captcha()
      .then((config) => {
        if (active) setSiteKey(config.siteKey);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(initialVerifyEmail ? RESEND_COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!verified) return;
    const timer = window.setTimeout(() => {
      navigate('/login', {
        replace: true,
        state: {
          verifiedEmail: email,
          message: 'Email đã được xác thực. Vui lòng đăng nhập bằng mật khẩu của bạn.',
        },
      });
    }, REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [verified, email, navigate]);

  if (user) {
    return <Navigate to={canAccessAdmin(user) ? '/admin/dishes' : '/'} replace />;
  }

  function resetCaptcha() {
    setCaptchaToken('');
    setCaptchaReset((value) => value + 1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    if (!captchaToken) {
      setError('Vui lòng xác nhận bạn không phải robot.');
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.register(
        {
          displayName: displayName.trim() || undefined,
          email,
          password,
          confirmPassword: confirm,
        },
        captchaToken,
      );
      if (result.requiresEmailConfirmation) {
        const targetEmail = result.email || email;
        setEmail(targetEmail);
        setSent(true);
        setBusy(false);
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setSearchParams({ verify: '1', email: targetEmail }, { replace: true });
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
      resetCaptcha();
      setBusy(false);
    }
  }

  async function onVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (verifying || verified) return;
    const cleanOtp = otp.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Vui lòng nhập mã xác nhận gồm 6 chữ số từ email.');
      return;
    }
    setVerifying(true);
    setError(null);
    setInfo(null);
    try {
      const result = await authApi.verifyOtp(email, cleanOtp);
      setVerified(true);
      setInfo(result.message || 'Xác thực email thành công! Đang chuyển đến trang đăng nhập…');
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields as ApiFieldErrors | undefined;
        setError(fields?.['token'] ?? fields?.['email'] ?? err.message);
      } else if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError('Xác nhận mã OTP thất bại.');
      }
    } finally {
      setVerifying(false);
    }
  }

  async function onResendOtp() {
    if (resending || cooldown > 0 || verified) return;
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const result = await authApi.resendOtp(email);
      setInfo(result.message || 'Đã gửi lại mã xác nhận tới email của bạn.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError || err instanceof HttpError) {
        setError(err.message);
      } else {
        setError('Không thể gửi lại mã xác nhận.');
      }
    } finally {
      setResending(false);
    }
  }

  function onResetToRegister() {
    setSent(false);
    setVerified(false);
    setOtp('');
    setError(null);
    setInfo(null);
    setSearchParams({}, { replace: true });
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
          <h1>Xác thực email</h1>
          <p className="lead">
            Chúng tôi đã gửi mã xác nhận OTP tới <b>{email}</b>. Vui lòng nhập mã bên dưới để kích
            hoạt tài khoản.
          </p>

          {verified ? (
            <>
              <div className="alert">
                <b>Thành công</b>
                <span>
                  {info ?? 'Xác thực email thành công! Đang chuyển đến trang đăng nhập…'}
                </span>
              </div>
              <Link
                className="btn btn-solid btn-lg"
                to="/login"
                state={{
                  verifiedEmail: email,
                  message: 'Email đã được xác thực. Vui lòng đăng nhập bằng mật khẩu của bạn.',
                }}
              >
                Đăng nhập ngay
              </Link>
            </>
          ) : (
            <>
              {info && (
                <div className="alert info">
                  <b>Thông báo</b>
                  <span>{info}</span>
                </div>
              )}
              <FormError message={error} />

              <form onSubmit={onVerifyOtp} method="POST">
                <div className="field">
                  <label htmlFor="otp-input">
                    Mã xác nhận OTP <span className="req">*</span>
                  </label>
                  <p id="otp-format-hint" className="field-hint">
                    Nhập mã gồm 6 chữ số được gửi tới hộp thư của bạn (kiểm tra cả mục Spam).
                  </p>
                  <input
                    id="otp-input"
                    name="otp"
                    className="otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    aria-describedby="otp-format-hint"
                    placeholder="123456"
                    required
                    autoFocus
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-solid btn-lg"
                  disabled={verifying || otp.length !== 6}
                >
                  {verifying ? 'Đang xác nhận…' : 'Xác nhận mã OTP'}
                </button>
              </form>

              <div className="otp-actions">
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={onResendOtp}
                  disabled={resending || cooldown > 0}
                >
                  {resending
                    ? 'Đang gửi lại…'
                    : cooldown > 0
                      ? `Gửi lại mã (${cooldown}s)`
                      : 'Gửi lại mã'}
                </button>
              </div>

              <div className="auth-alt">
                Sai địa chỉ email?{' '}
                <a
                  href="#change-email"
                  onClick={(e) => {
                    e.preventDefault();
                    onResetToRegister();
                  }}
                >
                  Đăng ký lại
                </a>{' '}
                · <Link to="/login">Đăng nhập</Link>
              </div>
            </>
          )}
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

          {siteKey ? (
            <div className="field">
              <Recaptcha
                siteKey={siteKey}
                onToken={setCaptchaToken}
                resetSignal={captchaReset}
              />
            </div>
          ) : null}

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
