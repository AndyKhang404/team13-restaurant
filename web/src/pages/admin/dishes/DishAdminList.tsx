import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { dishesApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import { formatVnd } from '../../../lib/format';
import { CATEGORIES, categoryLabel, type Dish } from '../../../lib/types';

const SORTS = [
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'newest', label: 'Mới tạo' },
  { value: 'relevance', label: 'Độ phù hợp' },
  { value: 'name-asc', label: 'Tên A → Z' },
  { value: 'name-desc', label: 'Tên Z → A' },
  { value: 'price-asc', label: 'Giá thấp → cao' },
  { value: 'price-desc', label: 'Giá cao → thấp' },
  { value: 'prep-asc', label: 'Chuẩn bị nhanh nhất' },
  { value: 'ingredients-asc', label: 'Ít nguyên liệu nhất' },
  { value: 'ingredients-desc', label: 'Nhiều nguyên liệu nhất' },
];

const FILTER_KEYS = [
  'q',
  'category',
  'minPrice',
  'maxPrice',
  'chefId',
  'withIngredients',
  'withoutIngredients',
  'available',
  'featured',
  'maxPrepTime',
  'unassignedChef',
  'deleted',
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

export default function DishAdminList() {
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
    clearFilters,
  } = useListParams('pages');

  const minPrice = getFilter('minPrice');
  const maxPrice = getFilter('maxPrice');
  const chefId = getFilter('chefId');
  const withIngredients = getFilter('withIngredients');
  const withoutIngredients = getFilter('withoutIngredients');
  const available = getFilter('available');
  const featured = getFilter('featured');
  const maxPrepTime = getFilter('maxPrepTime');
  const unassignedChef = getFilter('unassignedChef');
  const deleted = getFilter('deleted');

  const effectiveSort = sort || (q ? 'relevance' : 'updated');
  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data: filterOpts } = useApi(() => dishesApi.filterOptions(), []);

  const filtersKey = [
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
    unassignedChef,
    deleted,
    effectiveSort,
    pageSize,
  ].join('|');

  const list = usePagedList<Dish>({
    loadPage: (targetPage) =>
      dishesApi.listPaged({
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
        unassignedChef: unassignedChef || undefined,
        deleted: deleted || undefined,
        sort: effectiveSort,
        page: targetPage,
        pageSize,
      }),
    page,
    mode,
    filtersKey,
    onPageChange: setPage,
  });

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
    unassignedChef,
    deleted,
  ].filter(Boolean).length;

  const rows = list.items;
  const total = list.pagination?.total ?? 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách món ăn</h2>
        <span className="count">{total} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Tìm tên, mô tả, bếp, nguyên liệu…"
            />
            <button type="submit">Tìm</button>
          </form>
          <select
            className="tools-select"
            value={effectiveSort}
            onChange={(event) => setFilter('sort', event.target.value)}
            aria-label="Sắp xếp"
          >
            {SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Link className="btn btn-primary" to="/admin/dishes/new">
            Thêm món
          </Link>
        </div>
      </div>

      <details className="filter-details" open={activeFilterCount > 0 || undefined}>
        <summary className="filter-summary">
          <span>Bộ lọc món ăn</span>
          {activeFilterCount > 0 ? (
            <span className="filter-count-badge">{activeFilterCount}</span>
          ) : null}
          {q || activeFilterCount > 0 ? (
            <button
              type="button"
              className="filter-clear-btn"
              onClick={(event) => {
                event.preventDefault();
                reset();
              }}
            >
              Xóa lọc
            </button>
          ) : null}
        </summary>
        <div className="filter-panel-body">
          <div className="filter-grid">
            <div className="filter-group full-span">
              <span className="filter-group-label">Danh mục (chọn nhiều)</span>
              <div className="filter-chips">
                {CATEGORIES.map((key) => {
                  const active = selectedCats.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`filter-chip${active ? ' active' : ''}`}
                      onClick={() => setFilter('category', toggleCsvItem(category, key))}
                    >
                      {categoryLabel(key)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Khoảng giá (VND)</span>
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
                placeholder="VD: 30"
                value={maxPrepTime}
                onChange={(event) => setFilter('maxPrepTime', event.target.value)}
              />
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Trạng thái bán</span>
              <select
                className="filter-select"
                value={available}
                onChange={(event) => setFilter('available', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="true">Đang bán</option>
                <option value="false">Ngừng bán</option>
              </select>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Món đặc sắc (Featured)</span>
              <select
                className="filter-select"
                value={featured}
                onChange={(event) => setFilter('featured', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="true">Đặc sắc</option>
                <option value="false">Món thường</option>
              </select>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Gán đầu bếp</span>
              <select
                className="filter-select"
                value={unassignedChef}
                onChange={(event) => setFilter('unassignedChef', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="true">Chưa gán đầu bếp</option>
                <option value="false">Đã có đầu bếp</option>
              </select>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Bản ghi đã xóa</span>
              <select
                className="filter-select"
                value={deleted}
                onChange={(event) => setFilter('deleted', event.target.value)}
              >
                <option value="">Ẩn món đã xóa</option>
                <option value="1">Hiển thị cả món đã xóa</option>
              </select>
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
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {filterOpts?.ingredients && filterOpts.ingredients.length > 0 ? (
              <>
                <div className="filter-group full-span">
                  <span className="filter-group-label">Bao gồm nguyên liệu</span>
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
                  <span className="filter-group-label">Loại trừ nguyên liệu</span>
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

      <PaginationToolbar
        mode={mode}
        onMode={setMode}
        page={page}
        pageSize={pageSize}
        onPageSize={setPageSize}
        pagination={list.pagination}
        unit="bản ghi"
      />

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
            {list.error && rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <ErrorState error={list.error} onRetry={list.reload} />
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
                      <Link
                        className="btn btn-sm btn-danger"
                        to={`/admin/dishes/${dish.id}/delete`}
                      >
                        Xóa
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!list.loading && !list.error && total === 0 ? (
          <div className="empty">
            <b>Không có món ăn nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm món mới vào thực đơn.
          </div>
        ) : null}

        {(list.loading || list.loadingMore) && rows.length === 0 ? <SkeletonRows rows={5} /> : null}
      </div>

      <div className="panel-foot">
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
          unit="bản ghi"
        />
      </div>
    </section>
  );
}
