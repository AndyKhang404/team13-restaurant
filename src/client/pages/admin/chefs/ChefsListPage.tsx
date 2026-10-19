import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../../../lib/api.js';
import { Avatar } from '../../../components/shared/Avatar.js';
import { Pagination, type PaginationData } from '../../../components/shared/Pagination.js';
import { ConfirmDeleteModal } from '../../../components/shared/ConfirmDeleteModal.js';
import { useFlash } from '../../../context/FlashContext.js';

interface AdminChef {
  id: string;
  name: string;
  specialty: string | null;
  bio: string | null;
  experienceYears: number;
  phone: string | null;
  isActive: boolean;
  avatarUrl: string | null;
  deletedAt: string | null;
}

interface ChefsListResponse {
  chefs: AdminChef[];
  pagination: PaginationData;
  q: string;
  showDeleted: boolean;
}

export const ChefsListPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setFlash } = useFlash();

  const page = searchParams.get('page') || '1';
  const q = searchParams.get('q') || '';
  const deleted = searchParams.get('deleted') || '';

  const [data, setData] = useState<ChefsListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState(q);
  const [deletedInput, setDeletedInput] = useState(deleted === '1');

  const [deletingChef, setDeletingChef] = useState<AdminChef | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(q);
    setDeletedInput(deleted === '1');
  }, [q, deleted]);

  const loadChefs = () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (page) query.set('page', page);
    if (q) query.set('q', q);
    if (deleted) query.set('deleted', deleted);

    apiFetch<ChefsListResponse>(`/admin/chefs?${query.toString()}`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadChefs();
  }, [page, q, deleted]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('q', searchInput.trim());
    if (deletedInput) next.set('deleted', '1');
    setSearchParams(next);
  };

  const handleRestore = async (chef: AdminChef) => {
    if (!window.confirm(`Khôi phục đầu bếp "${chef.name}"?`)) return;
    try {
      const res = await apiFetch<{ message: string }>(`/admin/chefs/${chef.id}/restore`, {
        method: 'POST',
      });
      setFlash({ type: 'success', message: res.message || 'Đã khôi phục đầu bếp.' });
      loadChefs();
    } catch (err) {
      if (err instanceof ApiError) {
        setFlash({ type: 'error', message: err.message });
      }
    }
  };

  const confirmDelete = async () => {
    if (!deletingChef) return;
    setIsDeleting(true);
    try {
      const res = await apiFetch<{ message: string }>(`/admin/chefs/${deletingChef.id}`, {
        method: 'DELETE',
      });
      setFlash({
        type: 'success',
        message: res.message || 'Đã chuyển đầu bếp vào danh sách đã xóa.',
      });
      setDeletingChef(null);
      loadChefs();
    } catch (err) {
      if (err instanceof ApiError) {
        setFlash({ type: 'error', message: err.message });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const chefs = data?.chefs || [];
  const hasFilter = Boolean(q || deleted);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Danh sách đầu bếp</h2>
          <span className="count">{chefs.length} bản ghi</span>
          <div className="panel-tools">
            <form className="search" onSubmit={handleFilterSubmit}>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm theo tên hoặc chuyên môn"
              />
              <button type="submit">Tìm</button>
            </form>

            <form
              onSubmit={handleFilterSubmit}
              style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
            >
              <label className="check">
                <input
                  type="checkbox"
                  checked={deletedInput}
                  onChange={(e) => setDeletedInput(e.target.checked)}
                />{' '}
                Đã xóa
              </label>

              <button type="submit" className="btn btn-quiet btn-sm">
                Lọc
              </button>

              {hasFilter ? (
                <button
                  type="button"
                  className="link-quiet"
                  onClick={() => setSearchParams({})}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Xóa lọc
                </button>
              ) : null}
            </form>

            <Link className="btn btn-primary" to="/admin/chefs/new">
              Thêm đầu bếp
            </Link>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Hình</th>
                <th>Họ và tên</th>
                <th>Chuyên môn</th>
                <th style={{ width: '110px' }}>Kinh nghiệm</th>
                <th>Số điện thoại</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody className="fade-late">
              {chefs.length > 0 ? (
                chefs.map((chef) => (
                  <tr key={chef.id}>
                    <td>
                      <Avatar
                        url={chef.avatarUrl}
                        name={chef.name}
                        size={50}
                        cls="thumb thumb-round"
                      />
                    </td>
                    <td>
                      <div className="cell-item">
                        <div>
                          <b>{chef.name}</b>
                          {chef.bio ? <small>{chef.bio}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge">{chef.specialty || '—'}</span>
                    </td>
                    <td className="num">{chef.experienceYears} năm</td>
                    <td className="mono">{chef.phone || '—'}</td>
                    <td>
                      {chef.deletedAt ? (
                        <span className="badge danger">Đã xóa</span>
                      ) : chef.isActive ? (
                        <span className="badge ok">Đang làm</span>
                      ) : (
                        <span className="badge warn">Nghỉ</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-sm btn-quiet" to={`/admin/chefs/${chef.id}/edit`}>
                          Sửa
                        </Link>
                        {chef.deletedAt ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            onClick={() => handleRestore(chef)}
                          >
                            Khôi phục
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setDeletingChef(chef)}
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : null}
            </tbody>
          </table>

          {!loading && chefs.length === 0 ? (
            <div className="empty">
              <b>Không có đầu bếp nào</b>
              Thử đổi từ khóa bộ lọc, hoặc thêm đầu bếp mới.
            </div>
          ) : null}
        </div>

        <Pagination pagination={data?.pagination} />
      </section>

      <ConfirmDeleteModal
        isOpen={Boolean(deletingChef)}
        title="Xác nhận xóa đầu bếp"
        itemName={deletingChef?.name || ''}
        itemType="đầu bếp"
        isDeleting={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingChef(null)}
      />
    </>
  );
};
