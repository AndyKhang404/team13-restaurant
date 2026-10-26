import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { chefsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { useListParams } from '../../../lib/useListParams';
import { usePagedList } from '../../../lib/usePagedList';
import { Avatar } from '../../../components/Avatar';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PaginationFooter, PaginationToolbar } from '../../../components/Pagination';
import type { Chef } from '../../../lib/types';

const SORTS = [
  { value: '', label: 'Mới cập nhật' },
  { value: 'relevance', label: 'Độ phù hợp' },
  { value: 'experience-desc', label: 'Kinh nghiệm cao → thấp' },
  { value: 'experience-asc', label: 'Kinh nghiệm thấp → cao' },
  { value: 'dishes-desc', label: 'Nhiều món phụ trách nhất' },
  { value: 'name-asc', label: 'Tên A → Z' },
  { value: 'newest', label: 'Mới tạo' },
];

const FILTER_KEYS = ['q', 'isActive', 'specialty', 'minExperience', 'hasActiveDishes', 'sort'];

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

export default function ChefAdminList() {
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

  const isActive = getFilter('isActive');
  const specialty = getFilter('specialty');
  const minExperience = getFilter('minExperience');
  const hasActiveDishes = getFilter('hasActiveDishes');

  const [input, setInput] = useState(q);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data: filterOpts } = useApi(() => chefsApi.filterOptions(), []);

  const filtersKey = [q, isActive, specialty, minExperience, hasActiveDishes, sort, pageSize].join(
    '|',
  );

  const list = usePagedList<Chef>({
    loadPage: (targetPage) =>
      chefsApi.listPaged({
        q: q || undefined,
        isActive: isActive || undefined,
        specialty: specialty || undefined,
        minExperience: minExperience || undefined,
        hasActiveDishes: hasActiveDishes || undefined,
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

  const specialties = filterOpts?.specialties ?? [];
  const selectedSpecialties = splitCsv(specialty);
  const activeFilterCount = [isActive, specialty, minExperience, hasActiveDishes].filter(
    Boolean,
  ).length;
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
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Tìm tên, chuyên môn, tiểu sử…"
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
          <Link className="btn btn-primary" to="/admin/chefs/new">
            Thêm đầu bếp
          </Link>
        </div>
      </div>

      <details className="filter-details" open={activeFilterCount > 0 || undefined}>
        <summary className="filter-summary">
          <span>Bộ lọc đầu bếp</span>
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
              <span className="filter-group-label">Trạng thái làm việc</span>
              <select
                className="filter-select"
                value={isActive}
                onChange={(event) => setFilter('isActive', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="true">Đang làm việc</option>
                <option value="false">Đang nghỉ</option>
              </select>
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Kinh nghiệm tối thiểu (năm)</span>
              <input
                type="number"
                min={0}
                max={100}
                className="filter-input"
                placeholder="VD: 5"
                value={minExperience}
                onChange={(event) => setFilter('minExperience', event.target.value)}
              />
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Có món đang bán trên thực đơn</span>
              <select
                className="filter-select"
                value={hasActiveDishes}
                onChange={(event) => setFilter('hasActiveDishes', event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="true">Có món đang bán</option>
                <option value="false">Chưa có món đang bán</option>
              </select>
            </div>

            {specialties.length > 0 ? (
              <div className="filter-group full-span">
                <span className="filter-group-label">Chuyên môn (chọn nhiều)</span>
                <div className="filter-chips">
                  {specialties.map((item) => {
                    const active = selectedSpecialties.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`filter-chip${active ? ' active' : ''}`}
                        onClick={() => setFilter('specialty', toggleCsvItem(specialty, item))}
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
                    <Avatar
                      url={chef.avatarUrl}
                      name={chef.name}
                      size={50}
                      cls="thumb thumb-round"
                    />
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
