import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { chefsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { Avatar } from '../../../components/Avatar';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';

const PAGE_SIZE = 10;

export default function ChefAdminList() {
  const { data, loading, error, reload } = useApi(() => chefsApi.list(), []);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAppliedQ(q);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const term = appliedQ.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.specialty ?? '').toLowerCase().includes(term),
    );
  }, [data, appliedQ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách đầu bếp</h2>
        <span className="count">{filtered.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên hoặc chuyên môn"
            />
            <button type="submit">Tìm</button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
            }}
            style={{ display: 'flex', gap: 10, alignItems: 'center' }}
          >
            {appliedQ ? (
              <a
                className="link-quiet"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setQ('');
                  setAppliedQ('');
                  setPage(1);
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

        {!loading && !error && filtered.length === 0 ? (
          <div className="empty">
            <b>Không có đầu bếp nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm đầu bếp mới.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={3} /> : null}
      </div>

      <PanelPager page={current} totalPages={totalPages} total={filtered.length} onPage={setPage} />
    </section>
  );
}
