import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dishesApi } from '../../lib/resources';
import { useApi } from '../../lib/useApi';
import { ApiError } from '../../lib/api';
import { Avatar } from '../../components/Avatar';
import { ErrorState, Loading, NotFoundState } from '../../components/StateViews';
import { formatDateTime, formatVnd } from '../../lib/format';
import { categoryLabel } from '../../lib/types';

export default function DishDetail() {
  const { slug } = useParams<{ slug: string }>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: dish, loading, error, reload } = useApi(() => dishesApi.getPublic(slug ?? ''), [slug]);

  if (loading) return <Loading />;
  if (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return (
        <NotFoundState title="Không tìm thấy món" message="Món ăn này không tồn tại.">
          <Link className="btn btn-solid" to="/dishes">
            Quay lại thực đơn
          </Link>
        </NotFoundState>
      );
    }
    return <ErrorState error={error} onRetry={reload} />;
  }
  if (!dish) {
    return (
      <NotFoundState title="Không tìm thấy món" message="Món ăn này không tồn tại.">
        <Link className="btn btn-solid" to="/dishes">
          Quay lại thực đơn
        </Link>
      </NotFoundState>
    );
  }

  const chef = dish.chef;

  return (
    <>
      <nav className="crumbs">
        <Link to="/dishes">Thực đơn</Link> /{' '}
        <Link to={`/dishes?category=${dish.category}`}>{categoryLabel(dish.category)}</Link> /{' '}
        {dish.name}
      </nav>

      <div className="detail">
        <div className="detail-media">
          {dish.imageUrl ? (
            <img src={dish.imageUrl} alt={dish.name} />
          ) : (
            <span className="media-ph" style={{ aspectRatio: '4 / 3' }}>
              {dish.name}
            </span>
          )}
        </div>

        <div>
          <div className="kicker">
            <span>{categoryLabel(dish.category)}</span>
            {dish.isAvailable ? (
              <span className="status">Đang bán</span>
            ) : (
              <span className="status off">Ngừng bán</span>
            )}
            {dish.isFeatured ? <span style={{ color: 'var(--accent)' }}>Món nổi bật</span> : null}
          </div>
          <h1>{dish.name}</h1>

          <span className="price">{formatVnd(dish.price)}</span>

          <dl className="specs">
            <div className="row">
              <dt>Danh mục</dt>
              <dd>{categoryLabel(dish.category)}</dd>
            </div>
            <div className="row">
              <dt>Giá bán</dt>
              <dd>{formatVnd(dish.price)}</dd>
            </div>
            {dish.prepTimeMinutes ? (
              <div className="row">
                <dt>Chế biến</dt>
                <dd>khoảng {dish.prepTimeMinutes} phút</dd>
              </div>
            ) : null}
            <div className="row">
              <dt>Trạng thái</dt>
              <dd>{dish.isAvailable ? 'Đang bán' : 'Ngừng bán'}</dd>
            </div>
            {dish.updatedAt ? (
              <div className="row">
                <dt>Cập nhật</dt>
                <dd>{formatDateTime(dish.updatedAt)}</dd>
              </div>
            ) : null}
          </dl>

          {dish.description ? (
            <div className="section">
              <h3>Mô tả</h3>
              <p>{dish.description}</p>
            </div>
          ) : null}

          {dish.ingredients.length > 0 ? (
            <div className="section">
              <h3>Nguyên liệu ({dish.ingredients.length})</h3>
              <div className="tags">
                {dish.ingredients.map((line) => {
                  const qty = `${line.quantity}${line.unit ? ` ${line.unit}` : ''}`;
                  return (
                    <span className="tag-item" key={line.ingredientId}>
                      {line.name ? `${line.name} · ${qty}` : qty}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          {chef ? (
            <>
              <div className="section">
                <h3>Đầu bếp phụ trách</h3>
                <div className="chef-card">
                  <button
                    type="button"
                    className="chef-open"
                    onClick={() => dialogRef.current?.showModal()}
                    aria-haspopup="dialog"
                    aria-controls="chef-dialog"
                    title={`Xem thông tin ${chef.name}`}
                  >
                    <Avatar url={chef.avatarUrl} name={chef.name} size={74} />
                    <span>
                      <span className="role">{chef.specialty ?? 'Bếp trưởng'}</span>
                      <b className="chef-name">{chef.name}</b>
                    </span>
                  </button>
                  <div />
                </div>
              </div>

              <dialog
                id="chef-dialog"
                className="chef-dialog"
                ref={dialogRef}
                aria-labelledby="chef-dialog-name"
                onClick={(e) => {
                  if (e.target === dialogRef.current) dialogRef.current?.close();
                }}
              >
                <div className="chef-dialog-card">
                  <button
                    type="button"
                    className="chef-dialog-close"
                    onClick={() => dialogRef.current?.close()}
                    aria-label="Đóng"
                  >
                    ×
                  </button>
                  <Avatar url={chef.avatarUrl} name={chef.name} size={96} />
                  <span className="role">{chef.specialty ?? 'Bếp trưởng'}</span>
                  <h3 id="chef-dialog-name">{chef.name}</h3>
                  {chef.specialty ? <p>{chef.specialty}</p> : null}
                </div>
              </dialog>
            </>
          ) : null}

          <div className="actions-row">
            <a className="btn btn-solid btn-lg" href="tel:19006868">
              Đặt bàn: 1900 6868
            </a>
            <Link className="btn btn-lg" to="/dishes">
              Quay lại thực đơn
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
