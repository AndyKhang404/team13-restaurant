import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { chefsApi } from '../../../lib/resources';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import { Avatar } from '../../../components/Avatar';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import type { Chef } from '../../../lib/types';

export default function ChefAdminList() {
  const { q, page, pageSize, mode, setFilter, setPage, setPageSize, setMode, clearFilters } =
    useListParams('pages');
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setQInput(q);
  }, [q]);

  const list = usePagedList<Chef>({
    loadPage: (targetPage) => chefsApi.listPaged({ q, page: targetPage, pageSize }),
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
        <h2>Danh sách đầu bếp</h2>
        <span className="count">{total} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Tìm theo tên hoặc chuyên môn"
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
          <Link className="btn btn-primary" to="/admin/chefs/new">
            Thêm đầu bếp
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
              <th>Họ và tên</th>
              <th>Chuyên môn</th>
              <th style={{ width: 110 }}>Kinh nghiệm</th>
              <th>Số điện thoại</th>
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
              rows.map((chef) => (
                <tr key={chef.id}>
                  <td>
                    <Avatar url={chef.avatarUrl} name={chef.name} size={50} cls="thumb thumb-round" />
                  </td>
                  <td>
                    <div className="cell-item">
                      <div>
                        <b>{chef.name}</b>
                        {chef.bio ? <small>{chef.bio}</small> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{chef.specialty ? chef.specialty : '—'}</span>
                  </td>
                  <td className="num">{chef.experienceYears} năm</td>
                  <td className="mono">{chef.phone ? chef.phone : '—'}</td>
                  <td>
                    {chef.isActive ? (
                      <span className="badge ok">Đang làm</span>
                    ) : (
                      <span className="badge warn">Nghỉ</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn btn-sm btn-quiet" to={`/admin/chefs/${chef.id}/edit`}>
                        Sửa
                      </Link>
                      <Link className="btn btn-sm btn-danger" to={`/admin/chefs/${chef.id}/delete`}>
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
            <b>Không có đầu bếp nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm đầu bếp mới.
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
