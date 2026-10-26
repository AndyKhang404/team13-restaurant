import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { usersApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import type { UserItem, UserRole } from '../../../lib/types';
import { ErrorState, NotFoundState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';
import { formatDateTime } from '../../../lib/format';

const PAGE_SIZE = 10;
const ROLES: UserRole[] = ['ADMIN', 'STAFF', 'CUSTOMER'];

function splitCsv(val: string): string[] {
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toggleCsvItem(current: string, item: string): string {
  const list = splitCsv(current);
  const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  return next.join(',');
}

export default function UserAdminList() {
  const { user: currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const role = params.get('role') ?? '';
  const createdFrom = params.get('createdFrom') ?? '';
  const createdTo = params.get('createdTo') ?? '';

  const [input, setInput] = useState(q);
  const [page, setPage] = useState(1);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data, loading, error, reload } = useApi(
    () =>
      usersApi.list({
        q: q || undefined,
        role: role || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
      }),
    [q, role, createdFrom, createdTo],
  );

  if (currentUser?.role !== 'ADMIN') {
    return (
      <NotFoundState
        title="403 - Không có quyền truy cập"
        message="Chỉ quản trị viên (ADMIN) mới có quyền truy cập trang quản lý người dùng."
      />
    );
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setPage(1);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setParam('q', input.trim());
  }

  function reset() {
    setInput('');
    setParams(new URLSearchParams());
    setPage(1);
  }

  const users = data ?? [];
  const selectedRoleFilters = splitCsv(role);
  const activeFilterCount = [role, createdFrom, createdTo].filter(Boolean).length;

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = users.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

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
        <span className="count">{users.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tìm theo email hoặc tên hiển thị…"
            />
            <button type="submit">Tìm</button>
          </form>
        </div>
      </div>

      <details className="filter-details" open={activeFilterCount > 0 || undefined}>
        <summary className="filter-summary">
          <span>Bộ lọc người dùng</span>
          {activeFilterCount > 0 ? (
            <span className="filter-count-badge">{activeFilterCount}</span>
          ) : null}
          {q || activeFilterCount > 0 ? (
            <button
              type="button"
              className="filter-clear-btn"
              onClick={(e) => {
                e.preventDefault();
                reset();
              }}
            >
              Xóa lọc
            </button>
          ) : null}
        </summary>
        <div className="filter-panel-body">
          <div className="filter-grid">
            <div className="filter-group">
              <span className="filter-group-label">Vai trò (chọn nhiều)</span>
              <div className="filter-chips">
                {ROLES.map((r) => {
                  const active = selectedRoleFilters.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`filter-chip${active ? ' active' : ''}`}
                      onClick={() => setParam('role', toggleCsvItem(role, r))}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Ngày đăng ký (Từ – Đến)</span>
              <div className="filter-range-row">
                <input
                  type="date"
                  className="filter-input"
                  value={createdFrom}
                  onChange={(e) => setParam('createdFrom', e.target.value)}
                  aria-label="Từ ngày"
                />
                <span className="filter-range-sep">–</span>
                <input
                  type="date"
                  className="filter-input"
                  value={createdTo}
                  onChange={(e) => setParam('createdTo', e.target.value)}
                  aria-label="Đến ngày"
                />
              </div>
            </div>
          </div>
        </div>
      </details>

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

        {!loading && !error && users.length === 0 ? (
          <div className="empty">
            <b>Không tìm thấy người dùng</b>
            Thử từ khóa hoặc bộ lọc khác.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={3} /> : null}
      </div>

      <div className="panel-foot">
        Bạn không thể tự đổi vai trò của mình; hệ thống chặn trường hợp hạ ADMIN cuối cùng.
      </div>

      <PanelPager page={current} totalPages={totalPages} total={users.length} onPage={setPage} />
    </section>
  );
}
