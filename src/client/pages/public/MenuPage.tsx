import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { DishCard, type DishItem } from '../../components/shared/DishCard.js';
import { SkeletonOverlay } from '../../components/shared/SkeletonOverlay.js';

interface CategoryItem {
  key: string;
  label: string;
}

interface DishGroup {
  key: string;
  label: string;
  dishes: DishItem[];
}

interface MenuResponse {
  groups: DishGroup[];
  flat: boolean;
  dishes: DishItem[];
  q: string;
  sort: string;
  resultCount: number;
  category?: string;
  categories: CategoryItem[];
}

export const MenuPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || '';
  const qParam = searchParams.get('q') || '';
  const sortParam = searchParams.get('sort') || '';

  const [data, setData] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Form local state for typing search
  const [searchInput, setSearchInput] = useState(qParam);
  const [sortInput, setSortInput] = useState(sortParam);

  useEffect(() => {
    setSearchInput(qParam);
    setSortInput(sortParam);
  }, [qParam, sortParam]);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams();
    if (categoryParam) query.set('category', categoryParam);
    if (qParam) query.set('q', qParam);
    if (sortParam) query.set('sort', sortParam);

    apiFetch<MenuResponse>(`/menu?${query.toString()}`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [categoryParam, qParam, sortParam]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      next.set('q', searchInput.trim());
    } else {
      next.delete('q');
    }
    if (sortInput) {
      next.set('sort', sortInput);
    } else {
      next.delete('sort');
    }
    setSearchParams(next);
  };

  const handleCategoryClick = (catKey: string) => {
    const next = new URLSearchParams(searchParams);
    if (catKey) {
      next.set('category', catKey);
    } else {
      next.delete('category');
    }
    setSearchParams(next);
  };

  return (
    <>
      <section className="hero" style={{ paddingBottom: 0 }}>
        <div className="eyebrow">Thực đơn theo mùa — giá đã bao gồm VAT</div>
        <h1>Thực đơn nhà hàng</h1>
        <p>Tìm món theo tên, lọc theo danh mục, sắp xếp theo giá hoặc tên — chọn và thưởng thức.</p>
      </section>

      <div className="toolbar">
        <div className="filters">
          <button
            type="button"
            className={`btn-filter ${!categoryParam ? 'active' : ''}`.trim()}
            onClick={() => handleCategoryClick('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            Tất cả
          </button>
          {data?.categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`btn-filter ${categoryParam === c.key ? 'active' : ''}`.trim()}
              onClick={() => handleCategoryClick(c.key)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <form className="menu-tools" onSubmit={handleSearchSubmit} role="search">
          <input
            className="menu-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm món theo tên…"
            aria-label="Tìm món theo tên"
          />
          <select
            className="menu-sort"
            value={sortInput}
            onChange={(e) => {
              setSortInput(e.target.value);
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set('sort', e.target.value);
              else next.delete('sort');
              setSearchParams(next);
            }}
            aria-label="Sắp xếp"
          >
            <option value="">Tên A → Z</option>
            <option value="name-desc">Tên Z → A</option>
            <option value="price-asc">Giá thấp → cao</option>
            <option value="price-desc">Giá cao → thấp</option>
            <option value="newest">Mới cập nhật</option>
          </select>
          <button className="btn btn-solid" type="submit">
            Tìm
          </button>
        </form>
      </div>

      {loading ? (
        <div className="menu-skel">
          <SkeletonOverlay />
        </div>
      ) : data?.flat ? (
        <div className="menu-skel">
          <div className="eyebrow" style={{ marginTop: '38px' }}>
            Kết quả{qParam ? ` cho "${qParam}"` : ''}
            <span style={{ color: 'var(--ink-2)' }}> — {data.resultCount} món</span>
          </div>

          {data.dishes.length > 0 ? (
            <div className="grid" style={{ marginTop: '22px' }}>
              {data.dishes.map((dish) => (
                <DishCard key={dish.id} dish={dish} />
              ))}
            </div>
          ) : (
            <div className="empty" style={{ marginTop: '36px' }}>
              <b>Không tìm thấy món nào</b>
              Thử từ khóa khác, bỏ bớt bộ lọc, hoặc xem toàn bộ thực đơn.
              <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
                <Link className="btn btn-solid" to="/menu" onClick={() => setSearchParams({})}>
                  Xem tất cả
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="menu-skel">
          {data?.groups && data.groups.length > 0 ? (
            data.groups.map((group) => (
              <React.Fragment key={group.key}>
                <div className="eyebrow" style={{ marginTop: '42px' }}>
                  {group.label}{' '}
                  <span style={{ color: 'var(--ink-2)' }}> — {group.dishes.length} món</span>
                </div>
                <div className="grid" style={{ marginTop: '22px' }}>
                  {group.dishes.map((dish) => (
                    <DishCard key={dish.id} dish={dish} />
                  ))}
                </div>
              </React.Fragment>
            ))
          ) : (
            <div className="empty" style={{ marginTop: '48px' }}>
              <b>Không tìm thấy món nào</b>
              Thử chọn danh mục khác hoặc xem lại toàn bộ thực đơn.
              <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
                <Link className="btn btn-solid" to="/menu" onClick={() => setSearchParams({})}>
                  Xem tất cả
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
