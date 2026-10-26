import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { dishesApi } from '../../lib/resources';
import { useApi } from '../../lib/useApi';
import { DishCard } from '../../components/DishCard';
import { ErrorState, SkeletonGrid } from '../../components/StateViews';
import { CATEGORIES, categoryLabel } from '../../lib/types';

const SORTS = [
  { value: '', label: 'Mặc định (Đang bán & Tên)' },
  { value: 'relevance', label: 'Độ phù hợp' },
  { value: 'name-asc', label: 'Tên A → Z' },
  { value: 'name-desc', label: 'Tên Z → A' },
  { value: 'price-asc', label: 'Giá thấp → cao' },
  { value: 'price-desc', label: 'Giá cao → thấp' },
  { value: 'newest', label: 'Mới thêm' },
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'prep-asc', label: 'Chuẩn bị nhanh nhất' },
  { value: 'ingredients-asc', label: 'Ít nguyên liệu nhất' },
  { value: 'ingredients-desc', label: 'Nhiều nguyên liệu nhất' },
];

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

export default function DishList() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const chefId = params.get('chefId') ?? '';
  const withIngredients = params.get('withIngredients') ?? '';
  const withoutIngredients = params.get('withoutIngredients') ?? '';
  const available = params.get('available') ?? '';
  const featured = params.get('featured') ?? '';
  const maxPrepTime = params.get('maxPrepTime') ?? '';
  const sort = params.get('sort') ?? '';

  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data: filterOpts } = useApi(() => dishesApi.filterOptions(), []);

  const { data, loading, error, reload } = useApi(
    () =>
      dishesApi.listPublic({
        q: q || undefined,
        category: category || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        chefId: chefId || undefined,
        withIngredients: withIngredients || undefined,
        withoutIngredients: withoutIngredients || undefined,
        available: available || undefined,
        featured: featured || undefined,
        maxPrepTime: maxPrepTime || undefined,
        sort: sort || undefined,
      }),
    [
      q,
      category,
      minPrice,
      maxPrice,
      chefId,
      withIngredients,
      withoutIngredients,
      available,
      featured,
      maxPrepTime,
      sort,
    ],
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  function clearFilters() {
    setInput('');
    setParams(new URLSearchParams());
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setParam('q', input.trim());
  }

  const selectedCats = splitCsv(category);
  const selectedChefs = splitCsv(chefId);
  const selectedWithIng = splitCsv(withIngredients);
  const selectedWithoutIng = splitCsv(withoutIngredients);

  const activeFilterCount = [
    category,
    minPrice,
    maxPrice,
    chefId,
    withIngredients,
    withoutIngredients,
    available,
    featured,
    maxPrepTime,
  ].filter(Boolean).length;

  const hasAnyFilterOrSearch = Boolean(q || sort || activeFilterCount > 0);
  const results = data ?? [];

  return (
    <div>
      <section className="hero" style={{ paddingBottom: 0 }}>
        <div className="eyebrow">Thực đơn theo mùa — giá đã bao gồm VAT</div>
        <h1>Thực đơn nhà hàng</h1>
        <p>
          Tìm kiếm toàn văn theo món ăn, nguyên liệu hoặc đầu bếp; lọc theo giá, thời gian chuẩn bị,
          dị ứng nguyên liệu và sắp xếp linh hoạt.
        </p>
      </section>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="filters">
          <a
            href="#all"
            className={selectedCats.length === 0 ? 'active' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setParam('category', '');
            }}
          >
            Tất cả
          </a>
          {CATEGORIES.map((key) => {
            const isActive = selectedCats.includes(key);
            return (
              <a
                key={key}
                href={`#${key}`}
                className={isActive ? 'active' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setParam('category', toggleCsvItem(category, key));
                }}
              >
                {categoryLabel(key)}
              </a>
            );
          })}
        </div>
        <form className="menu-tools" onSubmit={onSubmit} role="search">
          <input
            className="menu-search"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tìm món, nguyên liệu, đầu bếp…"
            aria-label="Tìm món, nguyên liệu, đầu bếp"
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

      <details className="filter-details" open={activeFilterCount > 0 || undefined}>
        <summary className="filter-summary">
          <span>Bộ lọc nâng cao</span>
          {activeFilterCount > 0 ? (
            <span className="filter-count-badge">{activeFilterCount}</span>
          ) : null}
          {hasAnyFilterOrSearch ? (
            <button
              type="button"
              className="filter-clear-btn"
              onClick={(e) => {
                e.preventDefault();
                clearFilters();
              }}
            >
              Xóa tất cả lọc
            </button>
          ) : null}
        </summary>
        <div className="filter-panel-body">
          <div className="filter-grid">
            <div className="filter-group">
              <span className="filter-group-label">
                Khoảng giá (VND)
                {filterOpts?.priceRange?.max
                  ? ` (${filterOpts.priceRange.min.toLocaleString('vi-VN')} – ${filterOpts.priceRange.max.toLocaleString('vi-VN')})`
                  : ''}
              </span>
              <div className="filter-range-row">
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="filter-input"
                  placeholder="Từ"
                  value={minPrice}
                  onChange={(e) => setParam('minPrice', e.target.value)}
                />
                <span className="filter-range-sep">–</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="filter-input"
                  placeholder="Đến"
                  value={maxPrice}
                  onChange={(e) => setParam('maxPrice', e.target.value)}
                />
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Thời gian chuẩn bị tối đa (phút)</span>
              <input
                type="number"
                min={1}
                max={1440}
                className="filter-input"
                placeholder="VD: 20"
                value={maxPrepTime}
                onChange={(e) => setParam('maxPrepTime', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Tùy chọn nhanh</span>
              <div className="filter-checks-row">
                <label className="filter-check-label">
                  <input
                    type="checkbox"
                    checked={available === 'true'}
                    onChange={(e) => setParam('available', e.target.checked ? 'true' : '')}
                  />
                  Chỉ món đang bán
                </label>
                <label className="filter-check-label">
                  <input
                    type="checkbox"
                    checked={featured === 'true'}
                    onChange={(e) => setParam('featured', e.target.checked ? 'true' : '')}
                  />
                  Chỉ món đặc sắc
                </label>
              </div>
            </div>

            {filterOpts?.chefs && filterOpts.chefs.length > 0 ? (
              <div className="filter-group full-span">
                <span className="filter-group-label">Đầu bếp phụ trách</span>
                <div className="filter-chips">
                  {filterOpts.chefs.map((c) => {
                    const active = selectedChefs.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`filter-chip${active ? ' active' : ''}`}
                        onClick={() => setParam('chefId', toggleCsvItem(chefId, c.id))}
                      >
                        {c.name}
                        {c.specialty ? ` (${c.specialty})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {filterOpts?.ingredients && filterOpts.ingredients.length > 0 ? (
              <>
                <div className="filter-group full-span">
                  <span className="filter-group-label">Có nguyên liệu (chọn nhiều)</span>
                  <div className="filter-chips">
                    {filterOpts.ingredients.map((ing) => {
                      const active = selectedWithIng.includes(ing.id);
                      return (
                        <button
                          key={ing.id}
                          type="button"
                          className={`filter-chip${active ? ' active' : ''}`}
                          onClick={() =>
                            setParam('withIngredients', toggleCsvItem(withIngredients, ing.id))
                          }
                        >
                          + {ing.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="filter-group full-span">
                  <span className="filter-group-label">Loại trừ nguyên liệu / dị ứng</span>
                  <div className="filter-chips">
                    {filterOpts.ingredients.map((ing) => {
                      const active = selectedWithoutIng.includes(ing.id);
                      return (
                        <button
                          key={ing.id}
                          type="button"
                          className={`filter-chip exclude${active ? ' active' : ''}`}
                          onClick={() =>
                            setParam(
                              'withoutIngredients',
                              toggleCsvItem(withoutIngredients, ing.id),
                            )
                          }
                        >
                          ✕ {ing.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </details>

      {loading ? (
        <SkeletonGrid />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="menu-skel">
          <div className="eyebrow" style={{ marginTop: 28 }}>
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
                <button className="btn btn-solid" type="button" onClick={clearFilters}>
                  Xem tất cả
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
