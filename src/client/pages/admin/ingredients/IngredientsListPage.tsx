import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../../../lib/api.js';
import { formatVnd } from '../../../lib/format.js';
import { Pagination, type PaginationData } from '../../../components/shared/Pagination.js';
import { ConfirmDeleteModal } from '../../../components/shared/ConfirmDeleteModal.js';
import { useFlash } from '../../../context/FlashContext.js';

interface AdminIngredient {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number | string;
  pricePerUnit: number | string;
  isAvailable: boolean;
  imageUrl: string | null;
  deletedAt: string | null;
}

interface IngredientsListResponse {
  ingredients: AdminIngredient[];
  pagination: PaginationData;
  q: string;
  showDeleted: boolean;
}

export const IngredientsListPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setFlash } = useFlash();

  const page = searchParams.get('page') || '1';
  const q = searchParams.get('q') || '';
  const deleted = searchParams.get('deleted') || '';

  const [data, setData] = useState<IngredientsListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState(q);
  const [deletedInput, setDeletedInput] = useState(deleted === '1');

  const [deletingIngredient, setDeletingIngredient] = useState<AdminIngredient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(q);
    setDeletedInput(deleted === '1');
  }, [q, deleted]);

  const loadIngredients = () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (page) query.set('page', page);
    if (q) query.set('q', q);
    if (deleted) query.set('deleted', deleted);

    apiFetch<IngredientsListResponse>(`/admin/ingredients?${query.toString()}`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadIngredients();
  }, [page, q, deleted]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('q', searchInput.trim());
    if (deletedInput) next.set('deleted', '1');
    setSearchParams(next);
  };

  const handleRestore = async (ing: AdminIngredient) => {
    if (!window.confirm(`Khôi phục nguyên liệu "${ing.name}"?`)) return;
    try {
      const res = await apiFetch<{ message: string }>(`/admin/ingredients/${ing.id}/restore`, {
        method: 'POST',
      });
      setFlash({ type: 'success', message: res.message || 'Đã khôi phục nguyên liệu.' });
      loadIngredients();
    } catch (err) {
      if (err instanceof ApiError) {
        setFlash({ type: 'error', message: err.message });
      }
    }
  };

  const confirmDelete = async () => {
    if (!deletingIngredient) return;
    setIsDeleting(true);
    try {
      const res = await apiFetch<{ message: string }>(`/admin/ingredients/${deletingIngredient.id}`, {
        method: 'DELETE',
      });
      setFlash({
        type: 'success',
        message: res.message || 'Đã chuyển nguyên liệu vào danh sách đã xóa.',
      });
      setDeletingIngredient(null);
      loadIngredients();
    } catch (err) {
      if (err instanceof ApiError) {
        setFlash({ type: 'error', message: err.message });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const ingredients = data?.ingredients || [];
  const hasFilter = Boolean(q || deleted);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Danh sách nguyên liệu</h2>
          <span className="count">{ingredients.length} bản ghi</span>
          <div className="panel-tools">
            <form className="search" onSubmit={handleFilterSubmit}>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm theo tên nguyên liệu"
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

            <Link className="btn btn-primary" to="/admin/ingredients/new">
              Thêm nguyên liệu
            </Link>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Hình</th>
                <th>Nguyên liệu</th>
                <th style={{ width: '100px' }}>Đơn vị</th>
                <th style={{ width: '130px' }}>Tồn kho</th>
                <th style={{ width: '140px' }}>Đơn giá</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody className="fade-late">
              {ingredients.length > 0 ? (
                ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td>
                      {ing.imageUrl ? (
                        <img className="thumb" src={ing.imageUrl} alt={ing.name} />
                      ) : (
                        <span className="avatar">{ing.unit}</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-item">
                        <div>
                          <b>{ing.name}</b>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge">{ing.unit}</span>
                    </td>
                    <td className="num">{String(ing.stockQuantity)}</td>
                    <td className="num">{formatVnd(ing.pricePerUnit)}</td>
                    <td>
                      {ing.deletedAt ? (
                        <span className="badge danger">Đã xóa</span>
                      ) : ing.isAvailable ? (
                        <span className="badge ok">Sẵn có</span>
                      ) : (
                        <span className="badge warn">Hết</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link
                          className="btn btn-sm btn-quiet"
                          to={`/admin/ingredients/${ing.id}/edit`}
                        >
                          Sửa
                        </Link>
                        {ing.deletedAt ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            onClick={() => handleRestore(ing)}
                          >
                            Khôi phục
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setDeletingIngredient(ing)}
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

          {!loading && ingredients.length === 0 ? (
            <div className="empty">
              <b>Không có nguyên liệu nào</b>
              Thử đổi từ khóa bộ lọc, hoặc thêm nguyên liệu mới cho kho.
            </div>
          ) : null}
        </div>

        <Pagination pagination={data?.pagination} />
      </section>

      <ConfirmDeleteModal
        isOpen={Boolean(deletingIngredient)}
        title="Xác nhận xóa nguyên liệu"
        itemName={deletingIngredient?.name || ''}
        itemType="nguyên liệu"
        isDeleting={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingIngredient(null)}
      />
    </>
  );
};
