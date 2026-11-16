import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { FormError } from '../components/FieldError';
import { ApiError, HttpError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { authApi } from '../lib/resources';
import type { UserRole } from '../lib/types';

function roleLabel(role: UserRole): { text: string; tone: string } {
  switch (role) {
    case 'ADMIN':
      return { text: 'ADMIN', tone: 'danger' };
    case 'STAFF':
      return { text: 'STAFF', tone: 'warn' };
    default:
      return { text: 'VIEWER', tone: 'neutral' };
  }
}

export function displayUsername(displayName: string | null | undefined, email: string): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  const local = email.split('@')[0]?.trim();
  return local || email;
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerDownOutsideRef = useRef(false);

  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const username = displayUsername(user.displayName, user.email);
  const badge = roleLabel(user.role);
  const joinedAt = formatDateTime(user.createdAt);
  const emailMatches = confirmEmail.trim().toLowerCase() === user.email.trim().toLowerCase();

  function openDeleteDialog() {
    setConfirmEmail('');
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDeleteDialog() {
    if (busy) return;
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    if (dialogRef.current) {
      dialogRef.current.returnValue = '';
    }
    setConfirmEmail('');
    setError(null);
  }

  function isPointerOutsideDialog(clientX: number, clientY: number): boolean {
    const dialog = dialogRef.current;
    if (!dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom
    );
  }

  async function handleConfirmDelete(e: FormEvent) {
    e.preventDefault();
    if (busy || !emailMatches) return;
    setError(null);
    setBusy(true);
    try {
      const result = await authApi.deleteAccount(confirmEmail.trim());
      dialogRef.current?.close();
      // Navigate off the RequireAuth route before refresh() clears user to null.
      navigate('/', {
        replace: true,
        state: { message: result.message || 'Tài khoản đã được xóa.' },
      });
      await refresh();
    } catch (err) {
      if (err instanceof ApiError || err instanceof HttpError) {
        setError(err.message);
      } else {
        setError('Không thể xóa tài khoản. Vui lòng thử lại.');
      }
      setBusy(false);
    }
  }

  return (
    <section className="profile-page">
      <div className="eyebrow">Tài khoản cá nhân</div>
      <div className="profile-card">
        <div className="profile-header">
          <Avatar url={null} name={username} size={72} />
          <div className="profile-identity">
            <div className="profile-name-row">
              <h1>{username}</h1>
              <span className={`profile-badge is-${badge.tone}`}>{badge.text}</span>
            </div>
            <p className="profile-email">{user.email}</p>
          </div>
        </div>

        <dl className="profile-fields">
          <div className="profile-field">
            <dt>Tên hiển thị</dt>
            <dd>{username}</dd>
          </div>
          <div className="profile-field">
            <dt>Email</dt>
            <dd className="mono">{user.email}</dd>
          </div>
          <div className="profile-field">
            <dt>Vai trò</dt>
            <dd>
              <span className={`profile-badge is-${badge.tone}`}>{badge.text}</span>
            </dd>
          </div>
          <div className="profile-field">
            <dt>Ngày tham gia</dt>
            <dd className="mono">{joinedAt || '—'}</dd>
          </div>
        </dl>

        <div className="profile-actions">
          <Link className="btn btn-solid" to="/reset-password">
            Đổi mật khẩu
          </Link>
          <button type="button" className="btn btn-danger" onClick={openDeleteDialog}>
            Xóa tài khoản
          </button>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="profile-dialog"
        aria-labelledby="delete-account-title"
        onClose={handleDialogClose}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDown={(e) => {
          pointerDownOutsideRef.current = isPointerOutsideDialog(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (
            !busy &&
            pointerDownOutsideRef.current &&
            isPointerOutsideDialog(e.clientX, e.clientY)
          ) {
            closeDeleteDialog();
          }
          pointerDownOutsideRef.current = false;
        }}
      >
        <div className="profile-dialog-card">
          <h2 id="delete-account-title">Xóa vĩnh viễn tài khoản?</h2>
          <p className="profile-dialog-warn">
            Hành động này không thể hoàn tác. Hồ sơ và quyền truy cập của tài khoản{' '}
            <strong>{user.email}</strong> sẽ bị xóa hoàn toàn khỏi hệ thống.
          </p>

          <FormError message={error} />

          <form onSubmit={(e) => void handleConfirmDelete(e)}>
            <div className="field">
              <label htmlFor="delete-confirm-email">
                Nhập lại email <b>{user.email}</b> để xác nhận <span className="req">*</span>
              </label>
              <input
                id="delete-confirm-email"
                type="email"
                autoComplete="email"
                placeholder={user.email}
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                disabled={busy}
                required
              />
            </div>

            <div className="profile-dialog-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={closeDeleteDialog}
                disabled={busy}
                autoFocus
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={busy || !emailMatches}
                aria-busy={busy}
              >
                {busy ? 'Đang xóa…' : 'Xác nhận xóa tài khoản'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </section>
  );
}
