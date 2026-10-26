import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ingredientsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import { formatVnd } from '../../../lib/format';
import type { Ingredient } from '../../../lib/types';

const SORTS = [
  { value: '', label: 'Tên A → Z' },
  { value: 'relevance', label: 'Độ phù hợp' },
  { value: 'stock-asc', label: 'Tồn kho thấp → cao' },
  { value: 'stock-desc', label: 'Tồn kho cao → thấp' },
  { value: 'price-asc', label: 'Đơn giá thấp → cao' },
  { value: 'price-desc', label: 'Đơn giá cao → thấp' },
  { value: 'usage-desc', label: 'Dùng trong nhiều món nhất' },
  { value: 'updated', label: 'Mới cập nhật' },
];

const FILTER_KEYS = ['q', 'stock', 'isAvailable', 'unit', 'usage', 'sort'];

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

export default function IngredientAdminList() {
  const {
    q,
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

  const stock = getFilter('stock');
  const isAvailable = getFilter('isAvailable');
  const unit = getFilter('unit');
  const usage = getFilter('usage');

  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data: filterOpts } = useApi(() => ingredientsApi.filterOptions(), []);

  const filtersKey = [q, stock, isAvailable, unit, usage, sort, pageSize].join('|');

  const list = usePagedList<Ingredient>({
    loadPage: (targetPage) =>
      ingredientsApi.listPaged({
        q: q || undefined,
        stock: stock || undefined,
        isAvailable: isAvailable || undefined,
        unit: unit || undefined,
        usage: usage || undefined,
        sort: sort || undefined,
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

  const units = filterOpts?.units ?? [];
  const selectedUnits = splitCsv(unit);
  const activeFilterCount = [stock, isAvailable, unit, usage].filter(Boolean).length;
  const rows = list.items;
  const total = list.pagination?.total ?? 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách nguyên liệu</h2>
        <span className="count">{total} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Tìm tên nguyên liệu hoặc đơn vị…"
            />
            <button type="submit">Tìm</button>
          </form>
          <select
            className="tools-select"
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
          <Link className="btn btn-primary" to="/admin/ingredients/new">
            Thêm nguyên liệu
          </Link>
        </div>
      </div>

      <details className="filter-details" open={activeFilterCount > 0 || undefined}>
        <summary className="filter-summary">
          <span>Bộ lọc nguyên liệu</span>
          {activeFilterCount > 0 ? (
            <span className="filter-count-badge">{activeFilterCount}</span>
          ) : null}
          {q || sort || activeFilterCount > 0 ? (
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
            <div className="filter-group">
              <span className="filter-group-label">Mức tồn kho</span>
              <select
                className="filter-select"
                value={stock}
                onChange={(event) => setFilter('stock', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="in">Còn tồn kho (&gt; 0)</option>
                <option value="out">Hết tồn kho (= 0)</option>
              </select>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Trạng thái sẵn có</span>
              <select
                className="filter-select"
                value={isAvailable}
                onChange={(event) => setFilter('isAvailable', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="true">Sẵn có</option>
                <option value="false">Ngừng sử dụng</option>
              </select>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Tình trạng dùng trong món</span>
              <select
                className="filter-select"
                value={usage}
                onChange={(event) => setFilter('usage', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="activeDishes">Đang dùng trong món đang bán</option>
                <option value="unused">Chưa dùng trong món nào</option>
              </select>
            </div>

            {units.length > 0 ? (
              <div className="filter-group full-span">
                <span className="filter-group-label">Đơn vị tính (chọn nhiều)</span>
                <div className="filter-chips">
                  {units.map((item) => {
                    const active = selectedUnits.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`filter-chip${active ? ' active' : ''}`}
                        onClick={() => setFilter('unit', toggleCsvItem(unit, item))}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
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
              <th>Nguyên liệu</th>
              <th style={{ width: 100 }}>Đơn vị</th>
              <th style={{ width: 130 }}>Tồn kho</th>
              <th style={{ width: 140 }}>Đơn giá</th>
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
              rows.map((ingredient) => (
                <tr key={ingredient.id}>
                  <td>
                    {ingredient.imageUrl ? (
                      <img className="thumb" src={ingredient.imageUrl} alt={ingredient.name} />
                    ) : (
                      <span className="avatar">{ingredient.unit}</span>
                    )}
                  </td>
                  <td>
                    <div className="cell-item">
                      <div>
                        <b>{ingredient.name}</b>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{ingredient.unit}</span>
                  </td>
                  <td className="num">{ingredient.stockQuantity}</td>
                  <td className="num">{formatVnd(ingredient.pricePerUnit)}</td>
                  <td>
                    {ingredient.isAvailable ? (
                      <span className="badge ok">Sẵn có</span>
                    ) : (
                      <span className="badge warn">Hết</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link
                        className="btn btn-sm btn-quiet"
                        to={`/admin/ingredients/${ingredient.id}/edit`}
                      >
                        Sửa
                      </Link>
                      <Link
                        className="btn btn-sm btn-danger"
                        to={`/admin/ingredients/${ingredient.id}/delete`}
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
            <b>Không có nguyên liệu nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm nguyên liệu mới cho kho.
          </div>
        ) : null}

        {(list.loading || list.loadingMore) && rows.length === 0 ? <SkeletonRows rows={3} /> : null}
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
