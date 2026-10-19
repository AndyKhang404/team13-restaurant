import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { dishesApi } from '../../lib/resources';
import { useApi } from '../../lib/useApi';
import { DishCard } from '../../components/DishCard';
import { ErrorState, SkeletonGrid } from '../../components/StateViews';
import { CATEGORIES, categoryLabel } from '../../lib/types';

const SORTS = [
  { value: '', label: 'Tên A → Z' },
  { value: 'name-desc', label: 'Tên Z → A' },
  { value: 'price-asc', label: 'Giá thấp → cao' },
  { value: 'price-desc', label: 'Giá cao → thấp' },
  { value: 'newest', label: 'Mới cập nhật' },
];

export default function DishList() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? '';
  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data, loading, error, reload } = useApi(
    () => dishesApi.listPublic(q, category, sort),
    [q, category, sort],
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setParam('q', input.trim());
  }

  function categoryTo(key: string): string {
    const next = new URLSearchParams(params);
    if (key) next.set('category', key);
    else next.delete('category');
    const qs = next.toString();
    return qs ? `/dishes?${qs}` : '/dishes';
  }

  const results = data ?? [];

  return (
    <div>
      <section className="hero" style={{ paddingBottom: 0 }}>
        <div className="eyebrow">Thực đơn theo mùa — giá đã bao gồm VAT</div>
        <h1>Thực đơn nhà hàng</h1>
        <p>Tìm món theo tên, lọc theo danh mục, sắp xếp theo giá hoặc tên — chọn và thưởng thức.</p>
      </section>

      <div className="toolbar">
        <div className="filters">
          <Link to="/dishes" className={category ? undefined : 'active'}>
            Tất cả
          </Link>
          {CATEGORIES.map((key) => (
            <Link key={key} to={categoryTo(key)} className={category === key ? 'active' : undefined}>
              {categoryLabel(key)}
            </Link>
          ))}
        </div>
        <form className="menu-tools" onSubmit={onSubmit} role="search">
          <input
            className="menu-search"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tìm món theo tên…"
            aria-label="Tìm món theo tên"
          />
          <select
            className="menu-sort"
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            aria-label="Sắp xếp"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn btn-solid" type="submit">
            Tìm
          </button>
        </form>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="menu-skel">
          <div className="eyebrow" style={{ marginTop: 38 }}>
            Kết quả{q ? ` cho “${q}”` : ''}{' '}
            <span style={{ color: 'var(--ink-2)' }}>— {results.length} món</span>
          </div>
          {results.length ? (
            <div className="grid" style={{ marginTop: 22 }}>
              {results.map((dish) => (
                <DishCard key={dish.id} dish={dish} />
              ))}
            </div>
          ) : (
            <div className="empty" style={{ marginTop: 36 }}>
              <b>Không tìm thấy món nào</b>
              Thử từ khóa khác, bỏ bớt bộ lọc, hoặc xem toàn bộ thực đơn.
              <div className="actions-row" style={{ justifyContent: 'center', marginTop: 20 }}>
                <Link className="btn btn-solid" to="/dishes">
                  Xem tất cả
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
