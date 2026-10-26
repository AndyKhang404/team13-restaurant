import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { chefsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ApiError } from '../../../lib/api';
import { ErrorState, Loading, NotFoundState } from '../../../components/StateViews';
import { FormError } from '../../../components/FieldError';
import { Avatar } from '../../../components/Avatar';

export default function ChefDelete() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: chef, loading, error, reload } = useApi(() => chefsApi.get(id ?? ''), [id]);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return <NotFoundState title="Không tìm thấy đầu bếp" message="Đầu bếp này không tồn tại." />;
    }
    return <ErrorState error={error} onRetry={reload} />;
  }
  if (!chef)
    return <NotFoundState title="Không tìm thấy đầu bếp" message="Đầu bếp này không tồn tại." />;
  const targetId = chef.id;

  async function onDelete() {
    if (busy) return;
    setBusy(true);
    setDelError(null);
    try {
      await chefsApi.remove(targetId);
      navigate('/admin/chefs');
    } catch (err) {
      setDelError(err instanceof ApiError ? err.message : 'Không xóa được.');
      setBusy(false);
    }
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>Xóa đầu bếp</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/chefs">
            ← Danh sách đầu bếp
          </Link>
        </div>
      </div>

      <div className="delx-body">
        <FormError message={delError} />

        <div className="delx-warn" role="alert">
          <span className="mark" aria-hidden="true">
            !
          </span>
          <div>
            <b>Không thể hoàn tác</b>
            <p>
              Đầu bếp sẽ bị gỡ khỏi danh sách và xóa vĩnh viễn, không thể khôi phục sau bước này.
            </p>
          </div>
        </div>

        <div className="delx-target">
          <div className="delx-media is-round">
            <Avatar url={chef.avatarUrl} name={chef.name} size={108} />
          </div>
          <div className="delx-info">
            <div className="delx-tags">
              {chef.specialty ? <span className="badge">{chef.specialty}</span> : null}
              {chef.isActive ? (
                <span className="badge ok">Đang làm</span>
              ) : (
                <span className="badge warn">Nghỉ</span>
              )}
            </div>
            <h3 className="delx-name">{chef.name}</h3>
            <div className="delx-meta">
              <span>{chef.experienceYears} năm kinh nghiệm</span>
              {chef.phone ? <span>{chef.phone}</span> : null}
            </div>
          </div>
        </div>

        <p className="delx-confirm">
          Bạn có chắc muốn xóa đầu bếp <b>{chef.name}</b> khỏi danh sách?
        </p>
      </div>

      <div className="form-foot">
        <Link className="btn btn-quiet" to="/admin/chefs">
          Hủy, giữ lại
        </Link>
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => void onDelete()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Đang xóa…' : 'Xác nhận xóa'}
        </button>
      </div>
    </section>
  );
}
