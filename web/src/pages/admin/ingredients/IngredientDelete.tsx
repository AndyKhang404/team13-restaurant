import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ingredientsApi } from '../../../lib/resources';
import { useApi } from '../../../lib/useApi';
import { ApiError } from '../../../lib/api';
import { ErrorState, Loading, NotFoundState } from '../../../components/StateViews';
import { FormError } from '../../../components/FieldError';
import { formatVnd } from '../../../lib/format';

export default function IngredientDelete() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ing, loading, error, reload } = useApi(() => ingredientsApi.get(id ?? ''), [id]);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return (
        <NotFoundState title="Không tìm thấy nguyên liệu" message="Nguyên liệu này không tồn tại." />
      );
    }
    return <ErrorState error={error} onRetry={reload} />;
  }
  if (!ing)
    return (
      <NotFoundState title="Không tìm thấy nguyên liệu" message="Nguyên liệu này không tồn tại." />
    );
  const targetId = ing.id;

  async function onDelete() {
    setBusy(true);
    setDelError(null);
    try {
      await ingredientsApi.remove(targetId);
      navigate('/admin/ingredients');
    } catch (err) {
      setDelError(err instanceof ApiError ? err.message : 'Không xóa được.');
      setBusy(false);
    }
  }

  return (
    <section className="panel form-card">
      <div className="panel-head">
        <h2>Xóa nguyên liệu</h2>
        <div className="panel-tools">
          <Link className="link-quiet" to="/admin/ingredients">
            ← Kho nguyên liệu
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
              Nguyên liệu sẽ bị gỡ khỏi kho và xóa vĩnh viễn, không thể khôi phục sau bước này.
            </p>
          </div>
        </div>

        <div className="delx-target">
          <div className="delx-media">
            {ing.imageUrl ? (
              <img src={ing.imageUrl} alt={ing.name} />
            ) : (
              <span className="media-ph">{ing.name}</span>
            )}
          </div>
          <div className="delx-info">
            <div className="delx-tags">
              <span className="badge">{ing.unit}</span>
              {ing.isAvailable ? (
                <span className="badge ok">Sẵn có</span>
              ) : (
                <span className="badge warn">Hết</span>
              )}
            </div>
            <h3 className="delx-name">{ing.name}</h3>
            <div className="delx-meta">
              <span>
                Tồn kho {ing.stockQuantity} {ing.unit}
              </span>
              <span className="price">{formatVnd(ing.pricePerUnit)}</span>
            </div>
          </div>
        </div>

        <p className="delx-confirm">
          Bạn có chắc muốn xóa nguyên liệu <b>{ing.name}</b> khỏi kho?
        </p>
      </div>

      <div className="form-foot">
        <Link className="btn btn-quiet" to="/admin/ingredients">
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
