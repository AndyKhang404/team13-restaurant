import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { usersApi } from '../../../lib/resources';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import type { UserItem, UserRole } from '../../../lib/types';
import { ErrorState, NotFoundState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import { formatDateTime } from '../../../lib/format';

export default function UserAdminList() {
  const { user: currentUser } = useAuth();
  const { q, page, pageSize, mode, setFilter, setPage, setPageSize, setMode, clearFilters } =
    useListParams('pages');
  const [qInput, setQInput] = useState(q);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  const list = usePagedList<UserItem>({
    loadPage: (targetPage) => usersApi.listPaged({ q, page: targetPage, pageSize }),
    page,
    mode,
    filtersKey: `${q}|${pageSize}`,
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
    setFilter('q', qInput.trim());
  }

  function reset() {
    setQInput('');
    clearFilters(['q']);
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
      list.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể đổi vai trò.';
      setActionError(message);
    } finally {
      setSavingId(null);
    }
  }

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
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Tìm theo email hoặc tên"
            />
            <button type="submit">Tìm</button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
            }}
            style={{ display: 'flex', gap: 10, alignItems: 'center' }}
          >
            {q ? (
              <a
                className="link-quiet"
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  reset();
                }}
              >
                Xóa lọc
              </a>
            ) : null}
          </form>
        </div>
      </div>

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
              <th style={{ textAlign: 'right' }}>Cấp vai trò</th>
            </tr>
          </thead>
          <tbody className="fade-late">
            {list.error && rows.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <ErrorState error={list.error} onRetry={list.reload} />
                </td>
              </tr>
            ) : (
              rows.map((user) => {
                const effectiveRole = selectedRoles[user.id] ?? user.role;
                const isChanged = effectiveRole !== user.role;
                const isSaving = savingId === user.id;

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
                        <span className="badge">CUSTOMER</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {user.id === currentUser?.id ? (
                          <span className="count">Không tự đổi vai trò của mình</span>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            <select
                              className="role-select"
                              value={effectiveRole}
                              onChange={(event) =>
                                setSelectedRoles((previous) => ({
                                  ...previous,
                                  [user.id]: event.target.value as UserRole,
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
                              onClick={() => void handleRoleChange(user)}
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

        {!list.loading && !list.error && total === 0 ? (
          <div className="empty">
            <b>Không tìm thấy người dùng</b>
            Thử từ khóa khác.
          </div>
        ) : null}

        {(list.loading || list.loadingMore) && rows.length === 0 ? <SkeletonRows rows={3} /> : null}
      </div>

      <div className="panel-foot">
        Bạn không thể tự đổi vai trò của mình; hệ thống chặn trường hợp hạ ADMIN cuối cùng.
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
      </div>
    </section>
  );
}
