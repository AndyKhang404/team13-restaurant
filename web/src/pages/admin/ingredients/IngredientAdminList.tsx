import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ingredientsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ErrorState, SkeletonRows } from '../../../components/StateViews';
import { PanelPager } from '../../../components/PanelPager';
import { formatVnd } from '../../../lib/format';

const PAGE_SIZE = 10;

export default function IngredientAdminList() {
  const { data, loading, error, reload } = useApi(() => ingredientsApi.list(), []);
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
    return (data ?? []).filter((i) => i.name.toLowerCase().includes(term));
  }, [data, appliedQ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Danh sách nguyên liệu</h2>
        <span className="count">{filtered.length} bản ghi</span>
        <div className="panel-tools">
          <form className="search" onSubmit={onSubmit}>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên nguyên liệu"
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
          <Link className="btn btn-primary" to="/admin/ingredients/new">
            Thêm nguyên liệu
          </Link>
        </div>
      </div>

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

        {!loading && !error && filtered.length === 0 ? (
          <div className="empty">
            <b>Không có nguyên liệu nào</b>
            Thử đổi từ khóa bộ lọc, hoặc thêm nguyên liệu mới cho kho.
          </div>
        ) : null}

        {loading ? <SkeletonRows rows={3} /> : null}
      </div>

      <PanelPager page={current} totalPages={totalPages} total={filtered.length} onPage={setPage} />
    </section>
  );
}
