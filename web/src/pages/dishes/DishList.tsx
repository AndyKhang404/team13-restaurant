import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { dishesApi } from '../../lib/resources';
import { useApi } from '../../lib/useApi';
import { useListParams } from '../../lib/useListParams';
import { usePagedList } from '../../lib/usePagedList';
import { DishCard } from '../../components/DishCard';
import { ErrorState, SkeletonGrid } from '../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../components/Pagination';
import { CATEGORIES, categoryLabel, type Dish } from '../../lib/types';

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

const FILTER_KEYS = [
  'q',
  'fuzzy',
  'category',
  'minPrice',
  'maxPrice',
  'chefId',
  'withIngredients',
  'withoutIngredients',
  'available',
  'featured',
  'maxPrepTime',
  'sort',
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
  const {
    q,
    category,
    sort,
    page,
    pageSize,
    mode,
    getFilter,
    setFilter,
    setPage,
    setPageSize,
    setMode,
    buildFilterUrl,
    clearFilters,
  } = useListParams('infinite');

  const fuzzy = getFilter('fuzzy');
  const minPrice = getFilter('minPrice');
  const maxPrice = getFilter('maxPrice');
  const chefId = getFilter('chefId');
  const withIngredients = getFilter('withIngredients');
  const withoutIngredients = getFilter('withoutIngredients');
  const available = getFilter('available');
  const featured = getFilter('featured');
  const maxPrepTime = getFilter('maxPrepTime');

  const [input, setInput] = useState(q);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data: filterOpts } = useApi(() => dishesApi.filterOptions(), []);

  const filtersKey = [
    q,
    fuzzy,
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
    pageSize,
  ].join('|');

  const list = usePagedList<Dish>({
    loadPage: (targetPage) =>
      dishesApi.listPublic({
        q: q || undefined,
        fuzzy: fuzzy || undefined,
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
        page: targetPage,
        pageSize,
      }),
    page,
    mode,
    filtersKey,
    onPageChange: setPage,
  });

  useEffect(() => {
    if (mode === 'pages' && page > 1) {
      resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [mode, page]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFilter('q', input.trim());
  }

  function reset() {
    setInput('');
    clearFilters(FILTER_KEYS);
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
    fuzzy === 'false' ? 'fuzzy' : '',
  ].filter(Boolean).length;

  const hasAnyFilterOrSearch = Boolean(q || sort || activeFilterCount > 0);
  const results = list.items;
  const total = list.pagination?.total ?? 0;

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
          <Link
            to={`/dishes${buildFilterUrl({ category: '' })}`}
            className={selectedCats.length === 0 ? 'active' : undefined}
          >
            Tất cả
          </Link>
          {CATEGORIES.map((key) => {
            const isActive = selectedCats.includes(key);
            return (
              <Link
                key={key}
                to={`/dishes${buildFilterUrl({ category: toggleCsvItem(category, key) })}`}
                className={isActive ? 'active' : undefined}
              >
                {categoryLabel(key)}
              </Link>
            );
          })}
        </div>
        <form className="menu-tools" onSubmit={onSubmit} role="search">
          <input
            className="menu-search"
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Tìm món, nguyên liệu, đầu bếp…"
            aria-label="Tìm món, nguyên liệu, đầu bếp"
          />
          <select
            className="menu-sort"
            value={sort}
            onChange={(event) => setFilter('sort', event.target.value)}
            aria-label="Sắp xếp"
          >
            {SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
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
              onClick={(event) => {
                event.preventDefault();
                reset();
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
                  onChange={(event) => setFilter('minPrice', event.target.value)}
                />
                <span className="filter-range-sep">–</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="filter-input"
                  placeholder="Đến"
                  value={maxPrice}
                  onChange={(event) => setFilter('maxPrice', event.target.value)}
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
                onChange={(event) => setFilter('maxPrepTime', event.target.value)}
              />
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Tùy chọn nhanh</span>
              <div className="filter-checks-row">
                <label className="filter-check-label">
                  <input
                    type="checkbox"
                    checked={available === 'true'}
                    onChange={(event) => setFilter('available', event.target.checked ? 'true' : '')}
                  />
                  Chỉ món đang bán
                </label>
                <label className="filter-check-label">
                  <input
                    type="checkbox"
                    checked={featured === 'true'}
                    onChange={(event) => setFilter('featured', event.target.checked ? 'true' : '')}
                  />
                  Chỉ món đặc sắc
                </label>
                <label
                  className="filter-check-label"
                  title="Tìm kiếm gần đúng cho phép tìm thấy món ăn ngay cả khi gõ sai chính tả hoặc không dấu"
                >
                  <input
                    type="checkbox"
                    checked={fuzzy !== 'false'}
                    onChange={(event) =>
                      setFilter('fuzzy', event.target.checked ? '' : 'false')
                    }
                  />
                  Tìm gần đúng (Fuzzy)
                </label>
              </div>
            </div>

            {filterOpts?.chefs && filterOpts.chefs.length > 0 ? (
              <div className="filter-group full-span">
                <span className="filter-group-label">Đầu bếp phụ trách</span>
                <div className="filter-chips">
                  {filterOpts.chefs.map((chef) => {
                    const active = selectedChefs.includes(chef.id);
                    return (
                      <button
                        key={chef.id}
                        type="button"
                        className={`filter-chip${active ? ' active' : ''}`}
                        onClick={() => setFilter('chefId', toggleCsvItem(chefId, chef.id))}
                      >
                        {chef.name}
                        {chef.specialty ? ` (${chef.specialty})` : ''}
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
                    {filterOpts.ingredients.map((ingredient) => {
                      const active = selectedWithIng.includes(ingredient.id);
                      return (
                        <button
                          key={ingredient.id}
                          type="button"
                          className={`filter-chip${active ? ' active' : ''}`}
                          onClick={() =>
                            setFilter(
                              'withIngredients',
                              toggleCsvItem(withIngredients, ingredient.id),
                            )
                          }
                        >
                          + {ingredient.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="filter-group full-span">
                  <span className="filter-group-label">Loại trừ nguyên liệu / dị ứng</span>
                  <div className="filter-chips">
                    {filterOpts.ingredients.map((ingredient) => {
                      const active = selectedWithoutIng.includes(ingredient.id);
                      return (
                        <button
                          key={ingredient.id}
                          type="button"
                          className={`filter-chip exclude${active ? ' active' : ''}`}
                          onClick={() =>
                            setFilter(
                              'withoutIngredients',
                              toggleCsvItem(withoutIngredients, ingredient.id),
                            )
                          }
                        >
                          ✕ {ingredient.name}
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

      {list.loading && results.length === 0 ? (
        <SkeletonGrid />
      ) : list.error && results.length === 0 ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <div className="menu-skel" ref={resultsRef}>
          <div className="eyebrow" style={{ marginTop: 28 }}>
            Kết quả{q ? ` cho “${q}”` : ''}{' '}
            <span style={{ color: 'var(--ink-2)' }}>— {total} món</span>
          </div>

          <PaginationToolbar
            mode={mode}
            onMode={setMode}
            page={page}
            pageSize={pageSize}
            onPageSize={setPageSize}
            pagination={list.pagination}
            unit="món"
          />

          {results.length ? (
            <div className="grid" style={{ marginTop: 22 }}>
              {results.map((dish) => (
                <DishCard key={dish.id} dish={dish} />
              ))}
            </div>
          ) : list.outOfRange ? (
            <div className="empty" style={{ marginTop: 36 }}>
              <b>Trang {page} vượt quá phạm vi</b>
              Kết quả hiện có {list.pagination?.totalPages ?? 0} trang. Dùng nút bên dưới để quay
              lại.
            </div>
          ) : (
            <div className="empty" style={{ marginTop: 36 }}>
              <b>Không tìm thấy món nào</b>
              Thử từ khóa khác, bỏ bớt bộ lọc, hoặc xem toàn bộ thực đơn.
              <div className="actions-row" style={{ justifyContent: 'center', marginTop: 20 }}>
                <button className="btn btn-solid" type="button" onClick={reset}>
                  Xem tất cả
                </button>
              </div>
            </div>
          )}

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
            unit="món"
          />
        </div>
      )}
    </div>
  );
}
