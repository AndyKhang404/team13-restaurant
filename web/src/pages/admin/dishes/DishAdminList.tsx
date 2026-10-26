import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { dishesApi } from '../../../lib/resources';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import { formatVnd } from '../../../lib/format';
import { CATEGORIES, categoryLabel, type Dish } from '../../../lib/types';

export default function DishAdminList() {
  const {
    q,
    category,
    page,
    pageSize,
    mode,
    setFilter,
    setPage,
    setPageSize,
    setMode,
    clearFilters,
  } = useListParams('pages');
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  const list = usePagedList<Dish>({
    loadPage: (targetPage) =>
      dishesApi.listPaged({ q, category, page: targetPage, pageSize }),
    page,
    mode,
    filtersKey: `${q}|${category}|${pageSize}`,
    onPageChange: setPage,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFilter('q', qInput.trim());
  }

  function reset() {
    setQInput('');
    clearFilters(['q', 'category']);
  }

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
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Tìm theo tên món"
            />
            <button type="submit">Tìm</button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
            }}
            style={{ display: 'flex', gap: 10, alignItems: 'center' }}
          >
            <select
              className="tools-select"
              value={category}
              onChange={(event) => setFilter('category', event.target.value)}
            >
              <option value="">Tất cả danh mục</option>
              {CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key)}
                </option>
              ))}
            </select>
            {q || category ? (
              <a
                className="link-quiet"
                href="#"
                onClick={(event) => {
                  event.preventDefault();
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
