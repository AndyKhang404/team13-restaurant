import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { dishesApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ApiError } from '../../../lib/api';
import { ErrorState, Loading, NotFoundState } from '../../../components/StateViews';
import { FormError } from '../../../components/FieldError';
import { formatVnd } from '../../../lib/format';
import { categoryLabel } from '../../../lib/types';

export default function DishDelete() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: dish, loading, error, reload } = useApi(() => dishesApi.get(id ?? ''), [id]);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return <NotFoundState title="Không tìm thấy món" message="Món ăn này không tồn tại." />;
    }
    return <ErrorState error={error} onRetry={reload} />;
  }
  if (!dish) return <NotFoundState title="Không tìm thấy món" message="Món ăn này không tồn tại." />;
  const targetId = dish.id;

  async function onDelete() {
    if (busy) return;
    setBusy(true);
    setDelError(null);
    try {
      await dishesApi.remove(targetId);
      navigate('/admin/dishes');
    } catch (err) {
      setDelError(err instanceof ApiError ? err.message : 'Không xóa được.');
      setBusy(false);
    }
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>Xóa món ăn</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/dishes">
            ← Danh sách món
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
            <p>Món ăn sẽ bị gỡ khỏi thực đơn và xóa vĩnh viễn, không thể khôi phục sau bước này.</p>
          </div>
        </div>

        <div className="delx-target">
          <div className="delx-media">
            {dish.imageUrl ? (
              <img src={dish.imageUrl} alt={dish.name} />
            ) : (
              <span className="media-ph">{dish.name}</span>
            )}
          </div>
          <div className="delx-info">
            <div className="delx-tags">
              <span className="badge">{categoryLabel(dish.category)}</span>
              {dish.isAvailable ? (
                <span className="badge ok">Đang bán</span>
              ) : (
                <span className="badge warn">Ngừng bán</span>
              )}
              {dish.isFeatured ? <span className="badge">Nổi bật</span> : null}
            </div>
            <h3 className="delx-name">{dish.name}</h3>
            <div className="delx-meta">
              <span className="price">{formatVnd(dish.price)}</span>
              {dish.prepTimeMinutes ? <span>{dish.prepTimeMinutes} phút</span> : null}
              <span>{dish.chef ? `Đầu bếp ${dish.chef.name}` : 'Chưa phân công'}</span>
            </div>
          </div>
        </div>

        <p className="delx-confirm">
          Bạn có chắc muốn xóa <b>{dish.name}</b> khỏi thực đơn?
        </p>
      </div>

      <div className="form-foot">
        <Link className="btn btn-quiet" to="/admin/dishes">
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
