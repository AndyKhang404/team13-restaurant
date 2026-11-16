import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi, type LoginResult } from '../lib/resources';
import { ApiError, HttpError } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { FormError } from '../components/FieldError';
import Recaptcha from '../components/Recaptcha';
import { AuthAside, OtpField, PasswordField } from '../components/auth';

interface LocationState {
  from?: string;
  verifiedEmail?: string;
  message?: string;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export default function Login() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [email, setEmail] = useState(state.verifiedEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(state.message ?? null);
  const [busy, setBusy] = useState(false);
  const [siteKey, setSiteKey] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);

  const [step, setStep] = useState<'password' | 'mfa'>('password');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryOnly, setRecoveryOnly] = useState(false);

  useEffect(() => {
    let active = true;
    authApi
      .captcha()
      .then((config) => {
        if (!active) return;
        setSiteKey(config.siteKey);
        setCaptchaRequired(config.required);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (step !== 'mfa' || !challengeExpiresAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((challengeExpiresAt - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [step, challengeExpiresAt]);

  if (user) {
    return <Navigate to={canAccessAdmin(user) ? '/admin/dishes' : '/'} replace />;
  }

  function resetCaptcha() {
    setCaptchaToken('');
    setCaptchaReset((value) => value + 1);
  }

  async function refreshCaptcha() {
    try {
      const config = await authApi.captcha(email);
      setSiteKey(config.siteKey);
      setCaptchaRequired(config.required);
      if (config.required) resetCaptcha();
    } catch {
      // ignore; the next login attempt will surface the server error
    }
  }

  async function finishLogin(result: LoginResult) {
    if (result.recoveryUsed) {
      backToPassword();
      setError(null);
      setInfo(
        result.message ??
          'Đã dùng mã khôi phục. Xác thực hai lớp đã tắt; vui lòng đăng nhập lại bằng mật khẩu.',
      );
      return;
    }

    await refresh();
    const target =
      result.user && canAccessAdmin(result.user)
        ? (state.from ?? result.redirectTo ?? '/admin/dishes')
        : '/';
    navigate(target, { replace: true });
  }

  function backToPassword(message?: string) {
    setStep('password');
    setChallengeId(null);
    setChallengeExpiresAt(null);
    setMfaCode('');
    setRecoveryCode('');
    setUseRecoveryCode(false);
    setRecoveryOnly(false);
    setPassword('');
    setBusy(false);
    if (message) setError(message);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);
    if (captchaRequired && !captchaToken) {
      setError('Vui lòng xác nhận bạn không phải robot.');
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.login(email, password, captchaToken || undefined);

      if (result.mfaRequired && result.challengeId) {
        setChallengeId(result.challengeId);
        setChallengeExpiresAt(Date.now() + (result.expiresIn ?? 300) * 1000);
        setSecondsLeft(result.expiresIn ?? 300);
        setRecoveryOnly(Boolean(result.recoveryOnly));
        setUseRecoveryCode(Boolean(result.recoveryOnly));
        setStep('mfa');
        setBusy(false);
        return;
      }

      await finishLogin(result);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_CONFIRMED' || err.code === 'ACCOUNT_NOT_ACTIVATED') {
          let notice =
            'Tài khoản chưa kích hoạt email. Chúng tôi vừa gửi mã OTP mới tới hộp thư của bạn.';
          try {
            await authApi.resendOtp(email);
          } catch (resendErr) {
            if (resendErr instanceof ApiError || resendErr instanceof HttpError) {
              notice = `Tài khoản chưa kích hoạt email. ${resendErr.message}`;
            }
          }
          navigate(`/register?verify=1&email=${encodeURIComponent(email)}`, {
            state: { verifyEmail: email, notice },
          });
          return;
        }
        setError(
          err.code === 'INVALID_CREDENTIALS' ? 'Email hoặc mật khẩu không đúng.' : err.message,
        );
        if (
          err.code === 'CAPTCHA_FAILED' ||
          err.code === 'CAPTCHA_REQUIRED' ||
          err.code === 'INVALID_CAPTCHA'
        ) {
          setCaptchaRequired(true);
          resetCaptcha();
        } else {
          await refreshCaptcha();
        }
      } else if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError('Đăng nhập thất bại.');
      }
      setBusy(false);
    }
  }

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    if (busy || !challengeId) return;
    if (secondsLeft <= 0) {
      setError('Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    const code = useRecoveryCode ? recoveryCode.trim() : mfaCode.trim();
    if (!code) {
      setError(useRecoveryCode ? 'Vui lòng nhập mã khôi phục.' : 'Vui lòng nhập mã xác thực.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const result = useRecoveryCode
        ? await authApi.mfaVerifyRecovery(challengeId, code)
        : await authApi.mfaVerify(challengeId, code);
      await finishLogin(result);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'MFA_CHALLENGE_EXPIRED') {
          backToPassword('Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
          return;
        }
        if (err.code === 'INVALID_MFA_CODE' || err.code === 'INVALID_RECOVERY_CODE') {
          const attempts = err.fields?.attempts;
          setError(attempts ? `${err.message} Bạn còn ${attempts} lần thử.` : err.message);
        } else {
          setError(err.message);
        }
      } else if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError('Xác thực hai lớp thất bại.');
      }
      setBusy(false);
    }
  }

  const expired = step === 'mfa' && secondsLeft <= 0;

  return (
    <div className="auth-split">
      <AuthAside quote="Nhà hàng Việt, nấu theo mùa." />

      <div className="auth-body">
        {step === 'password' ? (
          <>
            <h1>Đăng nhập</h1>
            <p className="lead">Đăng nhập để đặt bàn và theo dõi đơn của bạn.</p>

            {info && (
              <div className="alert">
                <b>Thành công</b>
                <span>{info}</span>
              </div>
            )}
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

              <PasswordField
                id="password"
                label="Mật khẩu"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
                disabled={busy}
              />
              <div className="field" style={{ textAlign: 'left' }}>
                <Link to="/forgot-password" className="forgot-link">
                  Quên mật khẩu?
                </Link>
              </div>

              {captchaRequired && siteKey ? (
                <div className="field">
                  <Recaptcha
                    siteKey={siteKey}
                    onToken={setCaptchaToken}
                    resetSignal={captchaReset}
                  />
                </div>
              ) : null}

              <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
                {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </button>
            </form>

            <div className="auth-alt">
              Chưa có tài khoản? <Link to="/register">Tạo tài khoản</Link>
            </div>
          </>
        ) : (
          <>
            <h1>Xác thực hai lớp</h1>
            <p className="lead">
              Tài khoản <b>{email}</b> đã bật xác thực hai lớp. Nhập mã từ ứng dụng xác thực để
              tiếp tục.
            </p>

            <FormError message={error} />

            <div className={`mfa-countdown${expired ? ' is-expired' : ''}`}>
              {expired
                ? 'Phiên xác thực đã hết hạn.'
                : `Mã còn hiệu lực trong ${formatCountdown(secondsLeft)}`}
            </div>

            {expired ? (
              <button
                type="button"
                className="btn btn-solid btn-lg"
                onClick={() => backToPassword()}
              >
                Đăng nhập lại
              </button>
            ) : (
              <form onSubmit={onSubmitMfa}>
                {useRecoveryCode ? (
                  <div className="field">
                    <label htmlFor="recovery-code">
                      Mã khôi phục <span className="req">*</span>
                    </label>
                    <p className="field-hint">
                      Dùng một trong các mã khôi phục bạn đã lưu khi bật xác thực hai lớp.
                    </p>
                    <input
                      id="recovery-code"
                      type="text"
                      autoComplete="one-time-code"
                      autoFocus
                      placeholder="XXXX-XXXX"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                ) : (
                  <OtpField
                    id="mfa-code"
                    label="Mã xác thực"
                    hint="Nhập mã 6 chữ số từ Google Authenticator, Authy hoặc ứng dụng tương tự."
                    value={mfaCode}
                    onChange={setMfaCode}
                    disabled={busy}
                  />
                )}

                {!recoveryOnly ? (
                  <button
                    type="button"
                    className="btn btn-quiet mfa-switch"
                    onClick={() => {
                      setError(null);
                      setUseRecoveryCode((value) => !value);
                    }}
                    disabled={busy}
                  >
                    {useRecoveryCode ? 'Dùng mã từ ứng dụng' : 'Dùng mã khôi phục'}
                  </button>
                ) : null}

                <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
                  {busy ? 'Đang xác thực…' : 'Xác thực'}
                </button>
              </form>
            )}

            <div className="auth-alt">
              <button
                type="button"
                className="link-button"
                onClick={() => backToPassword()}
                disabled={busy}
              >
                Quay lại đăng nhập
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
