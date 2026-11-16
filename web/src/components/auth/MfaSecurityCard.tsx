import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError, HttpError } from '../../lib/api';
import {
  authApi,
  type MfaEnrollResult,
  type MfaEnrollVerifyResult,
  type MfaStatus,
} from '../../lib/resources';
import { formatDateTime } from '../../lib/format';
import { FormError } from '../FieldError';
import { OtpField, PasswordField } from './index';

type SetupStep = 'loading' | 'scan' | 'verify' | 'codes' | 'error';
type RecoveryStep = 'verify' | 'codes';

function groupCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function downloadCodes(codes: string[]): void {
  const blob = new Blob([codes.map(groupCode).join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'team13-recovery-codes.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof HttpError) return err.message;
  return fallback;
}

/** Self-service Supabase TOTP enrollment, recovery codes, and disable flow. */
export function MfaSecurityCard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const setupRef = useRef<HTMLDialogElement>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>('loading');
  const [enroll, setEnroll] = useState<MfaEnrollResult | null>(null);
  const [enrollResult, setEnrollResult] = useState<MfaEnrollVerifyResult | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);

  const disableRef = useRef<HTMLDialogElement>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableRecoveryCode, setDisableRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableBusy, setDisableBusy] = useState(false);

  const recoveryRef = useRef<HTMLDialogElement>(null);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('verify');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoverySaved, setRecoverySaved] = useState(false);

  async function loadStatus() {
    setStatusError(null);
    try {
      setStatus(await authApi.mfaStatus());
    } catch (err) {
      setStatusError(errorMessage(err, 'Không thể tải trạng thái xác thực hai lớp.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  function resetSetup() {
    setSetupStep('loading');
    setEnroll(null);
    setEnrollResult(null);
    setSetupCode('');
    setSetupError(null);
    setSetupBusy(false);
    setSavedCodes(false);
    setSecretCopied(false);
    setCodesCopied(false);
  }

  async function startEnroll() {
    setSetupStep('loading');
    setSetupError(null);
    try {
      const result = await authApi.mfaEnroll();
      setEnroll(result);
      setSetupStep('scan');
    } catch (err) {
      setSetupError(errorMessage(err, 'Không thể bắt đầu bật xác thực hai lớp.'));
      setSetupStep('error');
    }
  }

  function openSetup() {
    resetSetup();
    setupRef.current?.showModal();
    void startEnroll();
  }

  async function finishEnable() {
    try {
      await signOut();
    } catch {
      // AuthProvider clears local state in its own finally block.
    }
    navigate('/login', {
      replace: true,
      state: { message: 'Đã bật xác thực hai lớp. Vui lòng đăng nhập lại.' },
    });
  }

  async function submitSetupCode(e: FormEvent) {
    e.preventDefault();
    if (setupBusy || !enroll) return;
    if (!/^\d{6}$/.test(setupCode)) {
      setSetupError('Mã xác thực phải gồm đúng 6 chữ số.');
      return;
    }
    setSetupError(null);
    setSetupBusy(true);
    try {
      const result = await authApi.mfaEnrollVerify(enroll.factorId, setupCode);
      setEnrollResult(result);
      setSetupStep('codes');
    } catch (err) {
      setSetupError(errorMessage(err, 'Mã xác thực không đúng. Vui lòng thử lại.'));
    } finally {
      setSetupBusy(false);
    }
  }

  function closeSetup() {
    if (setupBusy) return;
    if (setupStep === 'codes') {
      void finishEnable();
      return;
    }
    setupRef.current?.close();
    resetSetup();
  }

  function openDisable() {
    setDisablePassword('');
    setDisableCode('');
    setDisableRecoveryCode('');
    setUseRecoveryCode(false);
    setDisableError(null);
    setDisableBusy(false);
    disableRef.current?.showModal();
  }

  function closeDisable() {
    if (disableBusy) return;
    disableRef.current?.close();
  }

  async function submitDisable(e: FormEvent) {
    e.preventDefault();
    if (disableBusy) return;

    const code = useRecoveryCode ? disableRecoveryCode.trim() : disableCode.trim();
    if (!disablePassword) {
      setDisableError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (!code) {
      setDisableError(
        useRecoveryCode ? 'Vui lòng nhập mã khôi phục.' : 'Vui lòng nhập mã xác thực.',
      );
      return;
    }

    setDisableError(null);
    setDisableBusy(true);
    try {
      await authApi.mfaDisable({
        password: disablePassword,
        ...(useRecoveryCode ? { recoveryCode: code } : { code }),
      });
      disableRef.current?.close();
      try {
        await signOut();
      } catch {
        // AuthProvider clears local state in its own finally block.
      }
      navigate('/login', {
        replace: true,
        state: { message: 'Đã tắt xác thực hai lớp. Vui lòng đăng nhập lại.' },
      });
    } catch (err) {
      setDisableError(errorMessage(err, 'Không thể tắt xác thực hai lớp.'));
      setDisableBusy(false);
    }
  }

  function openRecoveryCodes() {
    setRecoveryStep('verify');
    setRecoveryCodeInput('');
    setNewRecoveryCodes([]);
    setRecoveryError(null);
    setRecoveryBusy(false);
    setRecoverySaved(false);
    setCodesCopied(false);
    recoveryRef.current?.showModal();
  }

  function closeRecoveryCodes() {
    if (recoveryBusy) return;
    recoveryRef.current?.close();
  }

  async function submitRecoveryCodes(e: FormEvent) {
    e.preventDefault();
    if (recoveryBusy) return;
    if (!/^\d{6}$/.test(recoveryCodeInput)) {
      setRecoveryError('Mã xác thực phải gồm đúng 6 chữ số.');
      return;
    }
    setRecoveryError(null);
    setRecoveryBusy(true);
    try {
      const result = await authApi.mfaRecoveryCodes(recoveryCodeInput);
      setNewRecoveryCodes(result.codes);
      setRecoveryStep('codes');
      void loadStatus();
    } catch (err) {
      setRecoveryError(errorMessage(err, 'Không thể tạo lại mã khôi phục.'));
    } finally {
      setRecoveryBusy(false);
    }
  }

  const enabled = Boolean(status?.enabled);

  return (
    <div className="profile-card profile-security">
      <div className="profile-security-head">
        <div>
          <h2>Xác thực hai lớp (2FA)</h2>
          <p className="muted small">
            Dùng ứng dụng xác thực (Google Authenticator, Authy…) để bảo vệ tài khoản.
          </p>
        </div>
        <span className={`profile-badge ${enabled ? 'is-success' : 'is-neutral'}`}>
          {loading ? 'Đang tải…' : enabled ? 'Đã bật' : 'Chưa bật'}
        </span>
      </div>

      <FormError message={statusError} />

      {enabled ? (
        <>
          <dl className="profile-fields">
            <div className="profile-field">
              <dt>Trạng thái</dt>
              <dd>Đang bảo vệ tài khoản bằng TOTP</dd>
            </div>
            <div className="profile-field">
              <dt>Bật lúc</dt>
              <dd className="mono">{formatDateTime(status?.enabledAt) || '—'}</dd>
            </div>
            <div className="profile-field">
              <dt>Mã khôi phục còn lại</dt>
              <dd>
                {status?.recoveryCodesEnabled
                  ? (status?.recoveryCodesRemaining ?? 'Không xác định')
                  : status?.enabled
                    ? 'Hết mã — hãy tạo lại'
                    : 'Chưa bật'}
              </dd>
            </div>
          </dl>
          {status?.lockedUntil ? (
            <div className="alert error">
              <b>Tạm khoá</b>
              <span>Đã nhập sai quá nhiều lần. Vui lòng thử lại sau.</span>
            </div>
          ) : null}
          <div className="profile-actions">
            <button type="button" className="btn btn-quiet" onClick={openRecoveryCodes}>
              Tạo lại mã khôi phục
            </button>
            <button type="button" className="btn btn-danger" onClick={openDisable}>
              Tắt xác thực hai lớp
            </button>
          </div>
        </>
      ) : (
        <div className="profile-actions">
          <button type="button" className="btn btn-solid" onClick={openSetup} disabled={loading}>
            Bật xác thực hai lớp
          </button>
        </div>
      )}

      <dialog
        ref={setupRef}
        className="profile-dialog"
        aria-labelledby="mfa-setup-title"
        onCancel={(e) => {
          if (setupBusy) {
            e.preventDefault();
            return;
          }
          if (setupStep === 'codes') {
            e.preventDefault();
            void finishEnable();
          }
        }}
        onClose={resetSetup}
      >
        <div className="profile-dialog-card mfa-dialog-card">
          <h2 id="mfa-setup-title">Bật xác thực hai lớp</h2>

          {setupStep === 'loading' ? <p className="muted">Đang tạo mã QR…</p> : null}

          {setupStep === 'scan' && enroll ? (
            <>
              <p className="muted small">
                Quét mã QR bằng ứng dụng xác thực, sau đó nhập mã 6 chữ số để xác nhận.
              </p>
              {enroll.qrCode ? (
                <img className="mfa-qr" src={enroll.qrCode} alt="Mã QR xác thực hai lớp" />
              ) : null}
              <div className="field">
                <label>Không quét được QR?</label>
                <p className="field-hint">Nhập thủ công khóa bên dưới vào ứng dụng xác thực.</p>
                <div className="mfa-secret">
                  <code>{groupCode(enroll.secret)}</code>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      void copyText(enroll.secret).then(setSecretCopied);
                    }}
                  >
                    {secretCopied ? 'Đã chép' : 'Chép'}
                  </button>
                </div>
              </div>
              <form onSubmit={(e) => void submitSetupCode(e)}>
                <FormError message={setupError} />
                <OtpField
                  id="mfa-setup-code"
                  label="Mã xác thực"
                  value={setupCode}
                  onChange={setSetupCode}
                  disabled={setupBusy}
                />
                <div className="profile-dialog-actions">
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={closeSetup}
                    disabled={setupBusy}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-solid" disabled={setupBusy}>
                    {setupBusy ? 'Đang xác nhận…' : 'Xác nhận và bật'}
                  </button>
                </div>
              </form>
            </>
          ) : null}

          {setupStep === 'codes' && enrollResult ? (
            <>
              <p className="muted small">
                Xác thực hai lớp đã bật. Lưu các mã khôi phục dưới đây ở nơi an toàn — chúng chỉ
                hiển thị một lần.
              </p>
              {enrollResult.warning ? (
                <div className="alert error">
                  <b>Lưu ý</b>
                  <span>{enrollResult.warning}</span>
                </div>
              ) : null}
              {enrollResult.recoveryCodes.length > 0 ? (
                <>
                  <pre className="mfa-codes">
                    {enrollResult.recoveryCodes.map(groupCode).join('\n')}
                  </pre>
                  <div className="profile-actions">
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => {
                        void copyText(enrollResult.recoveryCodes.map(groupCode).join('\n')).then(
                          setCodesCopied,
                        );
                      }}
                    >
                      {codesCopied ? 'Đã chép' : 'Chép mã'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => downloadCodes(enrollResult.recoveryCodes)}
                    >
                      Tải về .txt
                    </button>
                  </div>
                  <label className="mfa-confirm">
                    <input
                      type="checkbox"
                      checked={savedCodes}
                      onChange={(e) => setSavedCodes(e.target.checked)}
                    />
                    Tôi đã lưu các mã khôi phục này.
                  </label>
                </>
              ) : (
                <p className="muted small">
                  Không có mã khôi phục. Nếu mất thiết bị, hãy liên hệ quản trị viên để reset.
                </p>
              )}
              <div className="profile-dialog-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => void finishEnable()}
                  disabled={enrollResult.recoveryCodes.length > 0 && !savedCodes}
                >
                  Hoàn tất và đăng nhập lại
                </button>
              </div>
            </>
          ) : null}

          {setupStep === 'error' ? (
            <>
              <FormError message={setupError} />
              <div className="profile-dialog-actions">
                <button type="button" className="btn btn-quiet" onClick={closeSetup}>
                  Đóng
                </button>
                <button type="button" className="btn btn-solid" onClick={() => void startEnroll()}>
                  Thử lại
                </button>
              </div>
            </>
          ) : null}
        </div>
      </dialog>

      <dialog
        ref={disableRef}
        className="profile-dialog"
        aria-labelledby="mfa-disable-title"
        onCancel={(e) => {
          if (disableBusy) e.preventDefault();
        }}
      >
        <div className="profile-dialog-card">
          <h2 id="mfa-disable-title">Tắt xác thực hai lớp?</h2>
          <p className="profile-dialog-warn">
            Tài khoản sẽ chỉ còn được bảo vệ bằng mật khẩu. Bạn cần xác nhận mật khẩu và mã hiện
            tại.
          </p>
          <FormError message={disableError} />
          <form onSubmit={(e) => void submitDisable(e)}>
            <PasswordField
              id="mfa-disable-password"
              label="Mật khẩu"
              required
              autoComplete="current-password"
              value={disablePassword}
              onChange={setDisablePassword}
              disabled={disableBusy}
            />

            {useRecoveryCode ? (
              <div className="field">
                <label htmlFor="mfa-disable-recovery">
                  Mã khôi phục <span className="req">*</span>
                </label>
                <input
                  id="mfa-disable-recovery"
                  type="text"
                  autoComplete="one-time-code"
                  placeholder="XXXX-XXXX"
                  value={disableRecoveryCode}
                  onChange={(e) => setDisableRecoveryCode(e.target.value)}
                  disabled={disableBusy}
                />
              </div>
            ) : (
              <OtpField
                id="mfa-disable-code"
                label="Mã xác thực"
                hint="Nhập mã 6 chữ số hiện tại từ ứng dụng xác thực."
                value={disableCode}
                onChange={setDisableCode}
                disabled={disableBusy}
              />
            )}

            {status?.recoveryCodesEnabled ? (
              <button
                type="button"
                className="btn btn-quiet mfa-switch"
                onClick={() => setUseRecoveryCode((value) => !value)}
                disabled={disableBusy}
              >
                {useRecoveryCode ? 'Dùng mã từ ứng dụng' : 'Dùng mã khôi phục'}
              </button>
            ) : null}

            <div className="profile-dialog-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={closeDisable}
                disabled={disableBusy}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-danger" disabled={disableBusy}>
                {disableBusy ? 'Đang tắt…' : 'Tắt xác thực hai lớp'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog
        ref={recoveryRef}
        className="profile-dialog"
        aria-labelledby="mfa-recovery-title"
        onCancel={(e) => {
          if (recoveryBusy || (recoveryStep === 'codes' && !recoverySaved)) {
            e.preventDefault();
          }
        }}
      >
        <div className="profile-dialog-card mfa-dialog-card">
          <h2 id="mfa-recovery-title">Tạo lại mã khôi phục</h2>

          {recoveryStep === 'verify' ? (
            <>
              <p className="muted small">
                Nhập mã 6 chữ số hiện tại để xác nhận. Bộ mã cũ sẽ ngừng hoạt động ngay.
              </p>
              <FormError message={recoveryError} />
              <form onSubmit={(e) => void submitRecoveryCodes(e)}>
                <OtpField
                  id="mfa-recovery-code"
                  label="Mã xác thực"
                  value={recoveryCodeInput}
                  onChange={setRecoveryCodeInput}
                  disabled={recoveryBusy}
                />
                <div className="profile-dialog-actions">
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={closeRecoveryCodes}
                    disabled={recoveryBusy}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-solid" disabled={recoveryBusy}>
                    {recoveryBusy ? 'Đang tạo…' : 'Tạo bộ mã mới'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <p className="muted small">
                Lưu bộ mã mới ở nơi an toàn. Các mã này chỉ hiển thị một lần.
              </p>
              <pre className="mfa-codes">{newRecoveryCodes.map(groupCode).join('\n')}</pre>
              <div className="profile-actions">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    void copyText(newRecoveryCodes.map(groupCode).join('\n')).then(setCodesCopied);
                  }}
                >
                  {codesCopied ? 'Đã chép' : 'Chép mã'}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => downloadCodes(newRecoveryCodes)}
                >
                  Tải về .txt
                </button>
              </div>
              <label className="mfa-confirm">
                <input
                  type="checkbox"
                  checked={recoverySaved}
                  onChange={(e) => setRecoverySaved(e.target.checked)}
                />
                Tôi đã lưu các mã khôi phục này.
              </label>
              <div className="profile-dialog-actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={closeRecoveryCodes}
                  disabled={!recoverySaved}
                >
                  Hoàn tất
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
