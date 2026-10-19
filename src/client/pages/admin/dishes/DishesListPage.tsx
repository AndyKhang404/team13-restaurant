import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../../../lib/api.js';
import { formatVnd, CATEGORY_LABELS } from '../../../lib/format.js';
import { Pagination, type PaginationData } from '../../../components/shared/Pagination.js';
import { ConfirmDeleteModal } from '../../../components/shared/ConfirmDeleteModal.js';
import { useFlash } from '../../../context/FlashContext.js';

interface AdminDish {
  id: string;
  name: string;
  slug: string;
  price: number | string;
  category: string;
  imageUrl: string | null;
  isAvailable: boolean;
  deletedAt: string | null;
  chef?: { name: string } | null;
}

interface CategoryOption {
  key: string;
  label: string;
}

interface DishesListResponse {
  dishes: AdminDish[];
  pagination: PaginationData;
  q: string;
  category?: string;
  categories: CategoryOption[];
  showDeleted: boolean;
}

export const DishesListPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setFlash } = useFlash();

  const page = searchParams.get('page') || '1';
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const deleted = searchParams.get('deleted') || '';

  const [data, setData] = useState<DishesListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Search input state
  const [searchInput, setSearchInput] = useState(q);
  const [catInput, setCatInput] = useState(category);
  const [deletedInput, setDeletedInput] = useState(deleted === '1');

  // Delete modal state
  const [deletingDish, setDeletingDish] = useState<AdminDish | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setSearchInput(q);
    setCatInput(category);
    setDeletedInput(deleted === '1');
  }, [q, category, deleted]);

  const loadDishes = () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (page) query.set('page', page);
    if (q) query.set('q', q);
    if (category) query.set('category', category);
    if (deleted) query.set('deleted', deleted);

    apiFetch<DishesListResponse>(`/admin/dishes?${query.toString()}`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDishes();
  }, [page, q, category, deleted]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('q', searchInput.trim());
    if (catInput) next.set('category', catInput);
    if (deletedInput) next.set('deleted', '1');
    setSearchParams(next);
  };

  const handleRestore = async (dish: AdminDish) => {
    if (!window.confirm(`Khôi phục món "${dish.name}"?`)) return;
    try {
      const res = await apiFetch<{ message: string }>(`/admin/dishes/${dish.id}/restore`, {
        method: 'POST',
      });
      setFlash({ type: 'success', message: res.message || 'Đã khôi phục món ăn.' });
      loadDishes();
    } catch (err) {
      if (err instanceof ApiError) {
        setFlash({ type: 'error', message: err.message });
      }
    }
  };

  const confirmDelete = async () => {
    if (!deletingDish) return;
    setIsDeleting(true);
    try {
      const res = await apiFetch<{ message: string }>(`/admin/dishes/${deletingDish.id}`, {
        method: 'DELETE',
      });
      setFlash({ type: 'success', message: res.message || 'Đã chuyển món vào danh sách đã xóa.' });
      setDeletingDish(null);
      loadDishes();
    } catch (err) {
      if (err instanceof ApiError) {
        setFlash({ type: 'error', message: err.message });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const dishes = data?.dishes || [];
  const categories = data?.categories || [];
  const hasFilter = Boolean(q || category || deleted);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Danh sách món ăn</h2>
          <span className="count">{dishes.length} bản ghi</span>
          <div className="panel-tools">
            <form className="search" onSubmit={handleFilterSubmit}>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm theo tên món"
              />
              <button type="submit">Tìm</button>
            </form>

            <form
              onSubmit={handleFilterSubmit}
              style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
            >
              <select
                className="tools-select"
                value={catInput}
                onChange={(e) => setCatInput(e.target.value)}
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>

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

            <Link className="btn btn-primary" to="/admin/dishes/new">
              Thêm món
            </Link>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Hình</th>
                <th>Tên món</th>
                <th>Danh mục</th>
                <th style={{ width: '120px' }}>Giá</th>
                <th>Đầu bếp</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody className="fade-late">
              {dishes.length > 0 ? (
                dishes.map((dish) => (
                  <tr key={dish.id}>
                    <td>
                      {dish.imageUrl ? (
                        <img className="thumb" src={dish.imageUrl} alt={dish.name} loading="lazy" />
                      ) : (
                        <span className="thumb-ph">-</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-item">
                        <div>
                          <b>{dish.name}</b>
                          <small>/dishes/{dish.slug}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge">
                        {CATEGORY_LABELS[dish.category] ?? dish.category}
                      </span>
                    </td>
                    <td className="num">{formatVnd(dish.price)}</td>
                    <td>{dish.chef ? dish.chef.name : '—'}</td>
                    <td>
                      {dish.deletedAt ? (
                        <span className="badge danger">Đã xóa</span>
                      ) : dish.isAvailable ? (
                        <span className="badge ok">Đang bán</span>
                      ) : (
                        <span className="badge warn">Ngừng bán</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-sm btn-quiet" to={`/admin/dishes/${dish.id}/edit`}>
                          Sửa
                        </Link>
                        {dish.deletedAt ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            onClick={() => handleRestore(dish)}
                          >
                            Khôi phục
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setDeletingDish(dish)}
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

          {!loading && dishes.length === 0 ? (
            <div className="empty">
              <b>Không có món ăn nào</b>
              Thử đổi từ khóa bộ lọc, hoặc thêm món mới vào thực đơn.
            </div>
          ) : null}
        </div>

        <Pagination pagination={data?.pagination} />
      </section>

      <ConfirmDeleteModal
        isOpen={Boolean(deletingDish)}
        title="Xác nhận xóa món ăn"
        itemName={deletingDish?.name || ''}
        itemType="món"
        isDeleting={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingDish(null)}
      />
    </>
  );
};
