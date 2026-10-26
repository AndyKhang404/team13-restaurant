import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { chefsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { Avatar } from '../../../components/Avatar';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';

const PAGE_SIZE = 10;

const SORTS = [
  { value: '', label: 'Mới cập nhật' },
  { value: 'relevance', label: 'Độ phù hợp' },
  { value: 'experience-desc', label: 'Kinh nghiệm cao → thấp' },
  { value: 'experience-asc', label: 'Kinh nghiệm thấp → cao' },
  { value: 'dishes-desc', label: 'Nhiều món phụ trách nhất' },
  { value: 'name-asc', label: 'Tên A → Z' },
  { value: 'newest', label: 'Mới tạo' },
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

export default function ChefAdminList() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const isActive = params.get('isActive') ?? '';
  const specialty = params.get('specialty') ?? '';
  const minExperience = params.get('minExperience') ?? '';
  const hasActiveDishes = params.get('hasActiveDishes') ?? '';
  const sort = params.get('sort') ?? '';

  const [input, setInput] = useState(q);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const { data, loading, error, reload } = useApi(
    () =>
      chefsApi.listWithMeta({
        q: q || undefined,
        isActive: isActive || undefined,
        specialty: specialty || undefined,
        minExperience: minExperience || undefined,
        hasActiveDishes: hasActiveDishes || undefined,
        sort: sort || undefined,
      }),
    [q, isActive, specialty, minExperience, hasActiveDishes, sort],
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

  const chefs = data?.chefs ?? [];
  const specialties = data?.specialties ?? [];
  const selectedSpecialties = splitCsv(specialty);

  const activeFilterCount = [isActive, specialty, minExperience, hasActiveDishes].filter(
    Boolean,
  ).length;

  const totalPages = Math.max(1, Math.ceil(chefs.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = chefs.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách đầu bếp</h2>
        <span className="count">{chefs.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tìm tên, chuyên môn, tiểu sử…"
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
              <span className="filter-group-label">Trạng thái làm việc</span>
              <select
                className="filter-select"
                value={isActive}
                onChange={(e) => setParam('isActive', e.target.value)}
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
                onChange={(e) => setParam('minExperience', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <span className="filter-group-label">Có món đang bán trên thực đơn</span>
              <select
                className="filter-select"
                value={hasActiveDishes}
                onChange={(e) => setParam('hasActiveDishes', e.target.value)}
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
                  {specialties.map((spec) => {
                    const active = selectedSpecialties.includes(spec);
                    return (
                      <button
                        key={spec}
                        type="button"
                        className={`filter-chip${active ? ' active' : ''}`}
                        onClick={() => setParam('specialty', toggleCsvItem(specialty, spec))}
                      >
                        {spec}
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
              <th>Họ và tên</th>
              <th>Chuyên môn</th>
              <th style={{ width: 110 }}>Kinh nghiệm</th>
              <th>Số điện thoại</th>
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

        {!loading && !error && chefs.length === 0 ? (
          <div className="empty">
            <b>Không có đầu bếp nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm đầu bếp mới.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={3} /> : null}
      </div>

      <PanelPager page={current} totalPages={totalPages} total={chefs.length} onPage={setPage} />
    </section>
  );
}
