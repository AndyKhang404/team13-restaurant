import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { dishesApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';
import { formatVnd } from '../../../lib/format';
import { CATEGORIES, categoryLabel } from '../../../lib/types';

const PAGE_SIZE = 10;

export default function DishAdminList() {
  const { data, loading, error, reload } = useApi(() => dishesApi.list(), []);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAppliedQ(q);
    setPage(1);
  }

  function reset() {
    setQ('');
    setAppliedQ('');
    setCategory('');
    setPage(1);
  }

  const filtered = useMemo(() => {
    const term = appliedQ.trim().toLowerCase();
    return (data ?? []).filter((d) => {
      if (category && d.category !== category) return false;
      if (term && !d.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [data, appliedQ, category]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách món ăn</h2>
        <span className="count">{filtered.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên món"
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
            <select
              className="tools-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả danh mục</option>
              {CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key)}
                </option>
              ))}
            </select>
            {appliedQ || category ? (
              <a
                className="link-quiet"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  reset();
                }}
              >
                Xóa lọc
              </a>
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
              <th style={{ width: 70 }}>Hình</th>
              <th>Tên món</th>
              <th>Danh mục</th>
              <th style={{ width: 120 }}>Giá</th>
              <th>Đầu bếp</th>
              <th>Trạng thái</th>
              <th style={{ textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody className="fade-late">
            {error ? (
              <tr>
                <td colSpan={7}>
                  <ErrorState error={error} onRetry={reload} />
                </td>
              </tr>
            ) : (
              rows.map((dish) => (
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
                    <span className="badge">{categoryLabel(dish.category)}</span>
                  </td>
                  <td className="num">{formatVnd(dish.price)}</td>
                  <td>{dish.chef ? dish.chef.name : '—'}</td>
                  <td>
                    {dish.isAvailable ? (
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
                      <Link className="btn btn-sm btn-danger" to={`/admin/dishes/${dish.id}/delete`}>
                        Xóa
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && !error && filtered.length === 0 ? (
          <div className="empty">
            <b>Không có món ăn nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm món mới vào thực đơn.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={5} /> : null}
      </div>

      <PanelPager page={current} totalPages={totalPages} total={filtered.length} onPage={setPage} />
    </section>
  );
}
