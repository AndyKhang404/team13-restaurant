import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../../../lib/api.js';
import { formatDateTime } from '../../../lib/format.js';
import { Pagination, type PaginationData } from '../../../components/shared/Pagination.js';
import { useAuth } from '../../../context/AuthContext.js';
import { useFlash } from '../../../context/FlashContext.js';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
  createdAt: string;
}

interface UsersListResponse {
  users: AdminUser[];
  roles: string[];
  pagination: PaginationData;
  q: string;
}

export const UsersListPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const { setFlash } = useFlash();

  const page = searchParams.get('page') || '1';
  const q = searchParams.get('q') || '';

  const [data, setData] = useState<UsersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);

  // Selected roles per user id for the form select controls
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  const loadUsers = () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (page) query.set('page', page);
    if (q) query.set('q', q);

    apiFetch<UsersListResponse>(`/admin/users?${query.toString()}`)
      .then((res) => {
        setData(res);
        const map: Record<string, string> = {};
        res.users.forEach((u) => {
          map[u.id] = u.role;
        });
        setSelectedRoles(map);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, [page, q]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('q', searchInput.trim());
    setSearchParams(next);
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    setSelectedRoles((prev) => ({ ...prev, [userId]: newRole }));
  };

  const handleSaveRole = async (targetUser: AdminUser) => {
    const newRole = selectedRoles[targetUser.id];
    if (!newRole || newRole === targetUser.role) return;

    if (!window.confirm(`Đổi vai trò cho ${targetUser.email} thành ${newRole}?`)) {
      // Revert selection
      setSelectedRoles((prev) => ({ ...prev, [targetUser.id]: targetUser.role }));
      return;
    }

    setSavingId(targetUser.id);
    try {
      const res = await apiFetch<{ message: string }>(`/admin/users/${targetUser.id}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      setFlash({ type: 'success', message: res.message || 'Đổi vai trò thành công.' });
      loadUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        setFlash({ type: 'error', message: err.message });
      } else {
        setFlash({ type: 'error', message: 'Không thể cập nhật vai trò.' });
      }
      setSelectedRoles((prev) => ({ ...prev, [targetUser.id]: targetUser.role }));
    } finally {
      setSavingId(null);
    }
  };

  const users = data?.users || [];
  const roles = data?.roles || ['ADMIN', 'STAFF', 'CUSTOMER'];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách người dùng</h2>
        <span className="count">{users.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo email hoặc tên"
            />
            <button type="submit">Tìm</button>
          </form>
          {q ? (
            <button
              type="button"
              className="link-quiet"
              onClick={() => setSearchParams({})}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Xóa lọc
            </button>
          ) : null}
        </div>
      </div>

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
            {users.length > 0 ? (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="cell-item">
                      <span className="avatar">T13</span>
                      <div>
                        <b>{user.displayName || user.email}</b>
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
                        <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                          <select
                            className="role-select"
                            value={selectedRoles[user.id] || user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            disabled={savingId === user.id}
                          >
                            {roles.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            onClick={() => handleSaveRole(user)}
                            disabled={
                              savingId === user.id ||
                              selectedRoles[user.id] === user.role
                            }
                          >
                            {savingId === user.id ? 'Đang lưu...' : 'Lưu'}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : null}
          </tbody>
        </table>

        {!loading && users.length === 0 ? (
          <div className="empty">
            <b>Không tìm thấy người dùng</b>
            Thử từ khóa khác.
          </div>
        ) : null}
      </div>

      <div className="panel-foot">
        Bạn không thể tự đổi vai trò của mình; hệ thống chặn trường hợp hạ ADMIN cuối cùng.
      </div>

      <Pagination pagination={data?.pagination} />
    </section>
  );
};
