import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { usersApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import type { UserItem, UserRole } from '../../../lib/types';
import { ErrorState, NotFoundState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';
import { formatDateTime } from '../../../lib/format';

const PAGE_SIZE = 10;

export default function UserAdminList() {
  const { user: currentUser } = useAuth();
  const { data, loading, error, reload } = useApi(() => usersApi.list(), []);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (currentUser?.role !== 'ADMIN') {
    return (
      <NotFoundState
        title="403 - Không có quyền truy cập"
        message="Chỉ quản trị viên (ADMIN) mới có quyền truy cập trang quản lý người dùng."
      />
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAppliedQ(q);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const term = appliedQ.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        (u.displayName ?? '').toLowerCase().includes(term),
    );
  }, [data, appliedQ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  async function handleRoleChange(user: UserItem) {
    const newRole = selectedRoles[user.id] ?? user.role;
    if (newRole === user.role) return;

    const ok = window.confirm(`Bạn có chắc muốn đổi vai trò của ${user.email} thành ${newRole}?`);
    if (!ok) return;

    setSavingId(user.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await usersApi.updateRole(user.id, newRole);
      setActionSuccess(result.message || `Đã đổi vai trò của ${user.email} thành ${newRole}.`);
      await reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể đổi vai trò.';
      setActionError(message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách người dùng</h2>
        <span className="count">{filtered.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo email hoặc tên"
            />
            <button type="submit">Tìm</button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
            }}
            style={{ display: 'flex', gap: 10, alignItems: 'center' }}
          >
            {appliedQ ? (
              <a
                className="link-quiet"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setQ('');
                  setAppliedQ('');
                  setPage(1);
                }}
              >
                Xóa lọc
              </a>
            ) : null}
          </form>
        </div>
      </div>

      {actionSuccess ? (
        <div className="alert" style={{ margin: '14px 20px 0' }}>
          <b>Thành công</b>
          <span>{actionSuccess}</span>
        </div>
      ) : null}

      {actionError ? (
        <div className="alert error" style={{ margin: '14px 20px 0' }}>
          <b>Lỗi</b>
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Ngày đăng ký</th>
              <th>Vai trò</th>
              <th style={{ textAlign: 'right' }}>Cấp vai trò</th>
            </tr>
          </thead>
          <tbody className="fade-late">
            {error ? (
              <tr>
                <td colSpan={4}>
                  <ErrorState error={error} onRetry={reload} />
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const effectiveRole = selectedRoles[u.id] ?? u.role;
                const isChanged = effectiveRole !== u.role;
                const isSaving = savingId === u.id;

                return (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-item">
                        <span className="avatar">T13</span>
                        <div>
                          <b>{u.displayName ? u.displayName : u.email}</b>
                          {u.displayName ? <small>{u.email}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td className="mono">{formatDateTime(u.createdAt)}</td>
                    <td>
                      {u.role === 'ADMIN' ? (
                        <span className="badge danger">ADMIN</span>
                      ) : u.role === 'STAFF' ? (
                        <span className="badge warn">STAFF</span>
                      ) : (
                        <span className="badge">CUSTOMER</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {u.id === currentUser?.id ? (
                          <span className="count">Không tự đổi vai trò của mình</span>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            <select
                              className="role-select"
                              value={effectiveRole}
                              onChange={(e) =>
                                setSelectedRoles((prev) => ({
                                  ...prev,
                                  [u.id]: e.target.value as UserRole,
                                }))
                              }
                              disabled={isSaving}
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="STAFF">STAFF</option>
                              <option value="CUSTOMER">CUSTOMER</option>
                            </select>
                            <button
                              type="button"
                              className="btn btn-sm btn-quiet"
                              disabled={isSaving || !isChanged}
                              onClick={() => void handleRoleChange(u)}
                            >
                              {isSaving ? 'Đang lưu…' : 'Lưu'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {!loading && !error && filtered.length === 0 ? (
          <div className="empty">
            <b>Không tìm thấy người dùng</b>
            Thử từ khóa khác.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={3} /> : null}
      </div>

      <div className="panel-foot">
        Bạn không thể tự đổi vai trò của mình; hệ thống chặn trường hợp hạ ADMIN cuối cùng.
      </div>

      <PanelPager page={current} totalPages={totalPages} total={filtered.length} onPage={setPage} />
    </section>
  );
}
