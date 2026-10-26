import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { dishesApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';
import { formatVnd } from '../../../lib/format';
import { CATEGORIES, categoryLabel } from '../../../lib/types';

const PAGE_SIZE = 10;

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
  const unassignedChef = params.get('unassignedChef') ?? '';
  const deleted = params.get('deleted') ?? '';
  const rawSort = params.get('sort') ?? '';
  const effectiveSort = rawSort || (q ? 'relevance' : 'updated');

  const [input, setInput] = useState(q);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data: filterOpts } = useApi(() => dishesApi.filterOptions(), []);

  const { data, loading, error, reload } = useApi(
    () =>
      dishesApi.list({
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
      unassignedChef,
      deleted,
      effectiveSort,
    ],
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setPage(1);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setParam('q', input.trim());
  }

  function reset() {
    setInput('');
    setParams(new URLSearchParams());
    setPage(1);
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

  const list = data ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách món ăn</h2>
        <span className="count">{list.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tìm tên, mô tả, bếp, nguyên liệu…"
            />
            <button type="submit">Tìm</button>
          </form>
          <select
            className="tools-select"
            value={effectiveSort}
            onChange={(e) => setParam('sort', e.target.value)}
            aria-label="Sắp xếp"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
          {q || rawSort || activeFilterCount > 0 ? (
            <button
              type="button"
              className="filter-clear-btn"
              onClick={(e) => {
                e.preventDefault();
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
                      onClick={() => setParam('category', toggleCsvItem(category, key))}
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
                placeholder="VD: 30"
                value={maxPrepTime}
                onChange={(e) => setParam('maxPrepTime', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Trạng thái bán</span>
              <select
                className="filter-select"
                value={available}
                onChange={(e) => setParam('available', e.target.value)}
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
                onChange={(e) => setParam('featured', e.target.value)}
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
                onChange={(e) => setParam('unassignedChef', e.target.value)}
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
                onChange={(e) => setParam('deleted', e.target.value)}
              >
                <option value="">Ẩn món đã xóa</option>
                <option value="1">Hiển thị cả món đã xóa</option>
              </select>
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
                  <span className="filter-group-label">Loại trừ nguyên liệu</span>
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

        {!loading && !error && list.length === 0 ? (
          <div className="empty">
            <b>Không có món ăn nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm món mới vào thực đơn.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={5} /> : null}
      </div>

      <PanelPager page={current} totalPages={totalPages} total={list.length} onPage={setPage} />
    </section>
  );
}
