import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { dishesApi } from '../../lib/resources';
import { useListParams } from '../../lib/useListParams';
import { usePagedList } from '../../lib/usePagedList';
import { DishCard } from '../../components/DishCard';
import { ErrorState, SkeletonGrid } from '../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../components/Pagination';
import { CATEGORIES, categoryLabel, type Dish } from '../../lib/types';

const SORTS = [
  { value: '', label: 'Tên A → Z' },
  { value: 'name-desc', label: 'Tên Z → A' },
  { value: 'price-asc', label: 'Giá thấp → cao' },
  { value: 'price-desc', label: 'Giá cao → thấp' },
  { value: 'newest', label: 'Mới cập nhật' },
];

export default function DishList() {
  const {
    q,
    category,
    sort,
    page,
    pageSize,
    mode,
    setFilter,
    setPage,
    setPageSize,
    setMode,
    buildFilterUrl,
  } = useListParams('infinite');
  const [input, setInput] = useState(q);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const list = usePagedList<Dish>({
    loadPage: (targetPage) =>
      dishesApi.listPublic({ q, category, sort, page: targetPage, pageSize }),
    page,
    mode,
    filtersKey: `${q}|${category}|${sort}|${pageSize}`,
    onPageChange: setPage,
  });

  useEffect(() => {
    if (mode === 'pages' && page > 1) {
      resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [mode, page, pageSize]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFilter('q', input.trim());
  }

  const results = list.items;
  const total = list.pagination?.total ?? 0;

  return (
    <div>
      <section className="hero" style={{ paddingBottom: 0 }}>
        <div className="eyebrow">Thực đơn theo mùa — giá đã bao gồm VAT</div>
        <h1>Thực đơn nhà hàng</h1>
        <p>Tìm món theo tên, lọc theo danh mục, sắp xếp theo giá hoặc tên — chọn và thưởng thức.</p>
      </section>

      <div className="toolbar">
        <div className="filters">
          <Link to={`/dishes${buildFilterUrl({ category: '' })}`} className={category ? undefined : 'active'}>
            Tất cả
          </Link>
          {CATEGORIES.map((key) => (
            <Link
              key={key}
              to={`/dishes${buildFilterUrl({ category: key })}`}
              className={category === key ? 'active' : undefined}
            >
              {categoryLabel(key)}
            </Link>
          ))}
        </div>
        <form className="menu-tools" onSubmit={onSubmit} role="search">
          <input
            className="menu-search"
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Tìm món theo tên…"
            aria-label="Tìm món theo tên"
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

      {(list.loading || list.loadingMore) && results.length === 0 ? (
        <SkeletonGrid />
      ) : list.error && results.length === 0 ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <div className="menu-skel" ref={resultsRef}>
          <div className="eyebrow" style={{ marginTop: 38 }}>
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
              Kết quả hiện có {list.pagination?.totalPages ?? 0} trang. Dùng nút bên dưới để quay lại.
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
