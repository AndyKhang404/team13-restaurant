import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ingredientsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';
import { formatVnd } from '../../../lib/format';

const PAGE_SIZE = 10;

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
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const stock = params.get('stock') ?? '';
  const isAvailable = params.get('isAvailable') ?? '';
  const unit = params.get('unit') ?? '';
  const usage = params.get('usage') ?? '';
  const sort = params.get('sort') ?? '';

  const [input, setInput] = useState(q);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data, loading, error, reload } = useApi(
    () =>
      ingredientsApi.listWithMeta({
        q: q || undefined,
        stock: stock || undefined,
        isAvailable: isAvailable || undefined,
        unit: unit || undefined,
        usage: usage || undefined,
        sort: sort || undefined,
      }),
    [q, stock, isAvailable, unit, usage, sort],
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

  const ingredients = data?.ingredients ?? [];
  const units = data?.units ?? [];
  const selectedUnits = splitCsv(unit);

  const activeFilterCount = [stock, isAvailable, unit, usage].filter(Boolean).length;

  const totalPages = Math.max(1, Math.ceil(ingredients.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = ingredients.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách nguyên liệu</h2>
        <span className="count">{ingredients.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tìm tên nguyên liệu hoặc đơn vị…"
            />
            <button type="submit">Tìm</button>
          </form>
          <select
            className="tools-select"
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
            <div className="filter-group">
              <span className="filter-group-label">Mức tồn kho</span>
              <select
                className="filter-select"
                value={stock}
                onChange={(e) => setParam('stock', e.target.value)}
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
                onChange={(e) => setParam('isAvailable', e.target.value)}
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
                onChange={(e) => setParam('usage', e.target.value)}
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
                  {units.map((u) => {
                    const active = selectedUnits.includes(u);
                    return (
                      <button
                        key={u}
                        type="button"
                        className={`filter-chip${active ? ' active' : ''}`}
                        onClick={() => setParam('unit', toggleCsvItem(unit, u))}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </details>

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
            {error ? (
              <tr>
                <td colSpan={7}>
                  <ErrorState error={error} onRetry={reload} />
                </td>
              </tr>
            ) : (
              rows.map((ing) => (
                <tr key={ing.id}>
                  <td>
                    {ing.imageUrl ? (
                      <img className="thumb" src={ing.imageUrl} alt={ing.name} />
                    ) : (
                      <span className="avatar">{ing.unit}</span>
                    )}
                  </td>
                  <td>
                    <div className="cell-item">
                      <div>
                        <b>{ing.name}</b>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{ing.unit}</span>
                  </td>
                  <td className="num">{ing.stockQuantity}</td>
                  <td className="num">{formatVnd(ing.pricePerUnit)}</td>
                  <td>
                    {ing.isAvailable ? (
                      <span className="badge ok">Sẵn có</span>
                    ) : (
                      <span className="badge warn">Hết</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn btn-sm btn-quiet" to={`/admin/ingredients/${ing.id}/edit`}>
                        Sửa
                      </Link>
                      <Link
                        className="btn btn-sm btn-danger"
                        to={`/admin/ingredients/${ing.id}/delete`}
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

        {!loading && !error && ingredients.length === 0 ? (
          <div className="empty">
            <b>Không có nguyên liệu nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm nguyên liệu mới cho kho.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={3} /> : null}
      </div>

      <PanelPager
        page={current}
        totalPages={totalPages}
        total={ingredients.length}
        onPage={setPage}
      />
    </section>
  );
}
