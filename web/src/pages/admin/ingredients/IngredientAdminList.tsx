import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ingredientsApi } from '../../../lib/resources';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import { formatVnd } from '../../../lib/format';
import type { Ingredient } from '../../../lib/types';

export default function IngredientAdminList() {
  const { q, page, pageSize, mode, setFilter, setPage, setPageSize, setMode, clearFilters } =
    useListParams('pages');
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  const list = usePagedList<Ingredient>({
    loadPage: (targetPage) => ingredientsApi.listPaged({ q, page: targetPage, pageSize }),
    page,
    mode,
    filtersKey: `${q}|${pageSize}`,
    onPageChange: setPage,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFilter('q', qInput.trim());
  }

  function reset() {
    setQInput('');
    clearFilters(['q']);
  }

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
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Tìm theo tên nguyên liệu"
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
            {q ? (
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
          <Link className="btn btn-primary" to="/admin/ingredients/new">
            Thêm nguyên liệu
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
