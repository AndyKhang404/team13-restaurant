import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { usersApi } from '../../../lib/resources';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import type { ProfileStatus, UserItem, UserRole } from '../../../lib/types';
import { ErrorState, NotFoundState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import { formatDateTime } from '../../../lib/format';

const ROLES: UserRole[] = ['ADMIN', 'STAFF', 'VIEWER'];
const STATUSES: ProfileStatus[] = ['ACTIVE', 'SUSPENDED'];
const FILTER_KEYS = ['q', 'fuzzy', 'role', 'status', 'createdFrom', 'createdTo'];

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
  const {
    q,
    page,
    pageSize,
    mode,
    getFilter,
    setFilter,
    setPage,
    setPageSize,
    setMode,
    clearFilters,
  } = useListParams('pages');

  const fuzzy = getFilter('fuzzy');
  const role = getFilter('role');
  const status = getFilter('status');
  const createdFrom = getFilter('createdFrom');
  const createdTo = getFilter('createdTo');

  const [input, setInput] = useState(q);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const filtersKey = [q, fuzzy, role, status, createdFrom, createdTo, pageSize].join('|');

  const list = usePagedList<UserItem>({
    loadPage: (targetPage) =>
      usersApi.listPaged({
        q: q || undefined,
        fuzzy: fuzzy || undefined,
        role: role || undefined,
        status: status || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        page: targetPage,
        pageSize,
      }),
    page,
    mode,
    filtersKey,
    onPageChange: setPage,
  });

  if (currentUser?.role !== 'ADMIN') {
    return (
      <NotFoundState
        title="403 - Không có quyền truy cập"
        message="Chỉ quản trị viên (ADMIN) mới có quyền truy cập trang quản lý người dùng."
      />
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFilter('q', input.trim());
  }

  function reset() {
    setInput('');
    clearFilters(FILTER_KEYS);
  }

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
      setSelectedRoles((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      list.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể đổi vai trò.';
      setActionError(message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleStatusToggle(user: UserItem) {
    const currentStatus = user.status ?? 'ACTIVE';
    const nextStatus: ProfileStatus = currentStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const promptText =
      nextStatus === 'SUSPENDED'
        ? `Bạn có chắc muốn tạm khóa tài khoản ${user.email}?`
        : `Bạn có chắc muốn kích hoạt lại tài khoản ${user.email}?`;
    if (!window.confirm(promptText)) return;

    setSavingId(user.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await usersApi.updateStatus(user.id, nextStatus);
      setActionSuccess(result.message);
      list.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.';
      setActionError(message);
    } finally {
      setSavingId(null);
    }
  }

  const selectedRoleFilters = splitCsv(role);
  const selectedStatusFilters = splitCsv(status);
  const activeFilterCount = [role, status, createdFrom, createdTo].filter(Boolean).length;
  const rows = list.items;
  const total = list.pagination?.total ?? 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách người dùng</h2>
        <span className="count">{total} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
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
              onClick={(event) => {
                event.preventDefault();
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
                {ROLES.map((item) => {
                  const active = selectedRoleFilters.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`filter-chip${active ? ' active' : ''}`}
                      onClick={() => setFilter('role', toggleCsvItem(role, item))}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Trạng thái</span>
              <div className="filter-chips">
                {STATUSES.map((item) => {
                  const active = selectedStatusFilters.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`filter-chip${active ? ' active' : ''}`}
                      onClick={() => setFilter('status', toggleCsvItem(status, item))}
                    >
                      {item === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
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
                  onChange={(event) => setFilter('createdFrom', event.target.value)}
                  aria-label="Từ ngày"
                />
                <span className="filter-range-sep">–</span>
                <input
                  type="date"
                  className="filter-input"
                  value={createdTo}
                  onChange={(event) => setFilter('createdTo', event.target.value)}
                  aria-label="Đến ngày"
                />
              </div>
            </div>
          </div>
        </div>
      </details>

      <PaginationToolbar
        mode={mode}
        onMode={setMode}
        page={page}
        pageSize={pageSize}
        onPageSize={setPageSize}
        pagination={list.pagination}
        unit="bản ghi"
      />

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
              <th>Trạng thái</th>
              <th style={{ textAlign: 'right' }}>Quản lý</th>
            </tr>
          </thead>
          <tbody className="fade-late">
            {list.error && rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <ErrorState error={list.error} onRetry={list.reload} />
                </td>
              </tr>
            ) : (
              rows.map((user) => {
                const effectiveRole = selectedRoles[user.id] ?? user.role;
                const isChanged = effectiveRole !== user.role;
                const isSaving = savingId === user.id;
                const isSuspended = user.status === 'SUSPENDED';

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="cell-item">
                        <span className="avatar">T13</span>
                        <div>
                          <b>{user.displayName ? user.displayName : user.email}</b>
                          {user.displayName ? <small>{user.email}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td className="mono">{formatDateTime(user.createdAt)}</td>
                    <td>
                      {user.role === 'ADMIN' ? (
                        <span className="badge danger">ADMIN</span>
                      ) : user.role === 'STAFF' ? (
                        <span className="badge warn">STAFF</span>
                      ) : (
                        <span className="badge">VIEWER</span>
                      )}
                    </td>
                    <td>
                      {isSuspended ? (
                        <span className="badge danger">Đã khóa</span>
                      ) : (
                        <span className="badge ok">Hoạt động</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {user.id === currentUser?.id ? (
                          <span className="count">Không tự thao tác trên mình</span>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            <select
                              className="role-select"
                              value={effectiveRole}
                              onChange={(event) =>
                                setSelectedRoles((prev) => ({
                                  ...prev,
                                  [user.id]: event.target.value as UserRole,
                                }))
                              }
                              disabled={isSaving}
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="STAFF">STAFF</option>
                              <option value="VIEWER">VIEWER</option>
                            </select>
                            <button
                              type="button"
                              className="btn btn-sm btn-quiet"
                              disabled={isSaving || !isChanged}
                              onClick={() => void handleRoleChange(user)}
                            >
                              {isSaving ? 'Đang lưu…' : 'Lưu'}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${isSuspended ? 'btn-quiet' : 'btn-danger'}`}
                              disabled={isSaving}
                              onClick={() => void handleStatusToggle(user)}
                            >
                              {isSuspended ? 'Mở khóa' : 'Khóa'}
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

        {!list.loading && !list.error && total === 0 ? (
          <div className="empty">
            <b>Không tìm thấy người dùng</b>
            Thử từ khóa hoặc bộ lọc khác.
          </div>
        ) : null}

        {(list.loading || list.loadingMore) && rows.length === 0 ? <SkeletonRows rows={3} /> : null}
      </div>

      <div className="panel-foot">
        <PaginationFooter
          mode={mode}
          page={page}
          pagination={list.pagination}
          loading={list.loading}
          loadingMore={list.loadingMore}
          error={list.error}
          moreError={list.moreError}
          hasNext={list.hasNext}
          onPage={setPage}
          onLoadMore={list.loadNext}
          unit="bản ghi"
        />
        <p className="muted small">
          Bạn không thể tự đổi vai trò hay tạm khóa chính mình; hệ thống chặn hạ quyền hoặc khóa
          ADMIN hoạt động cuối cùng.
        </p>
      </div>
    </section>
  );
}
