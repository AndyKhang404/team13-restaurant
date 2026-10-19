import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../../lib/api.js';
import { formatVnd, formatDateTime } from '../../lib/format.js';
import { Avatar } from '../../components/shared/Avatar.js';

interface ChefInfo {
  id: string;
  name: string;
  specialty: string | null;
  bio: string | null;
  experienceYears: number;
  phone: string | null;
  avatarUrl: string | null;
}

interface DishDetailData {
  dish: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: number | string;
    category: string;
    imageUrl: string | null;
    isAvailable: boolean;
    isFeatured: boolean;
    prepTimeMinutes: number | null;
    updatedAt: string;
  };
  chef: ChefInfo | null;
  ingredients: string[];
  categoryLabel: string;
}

export const DishDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<DishDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [chefModalOpen, setChefModalOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);

    apiFetch<DishDetailData>(`/dishes/${slug}`)
      .then((res) => setData(res))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          console.error(err);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (chefModalOpen) {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [chefModalOpen]);

  if (loading) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center', fontFamily: 'var(--mono)' }}>
        Đang tải thông tin món ăn...
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="error-page" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div className="code">404</div>
        <h1>Không tìm thấy món ăn</h1>
        <p>Món bạn tìm không tồn tại, có thể đã được gỡ khỏi thực đơn.</p>
        <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
          <Link className="btn btn-solid" to="/">
            Về trang chủ
          </Link>
          <Link className="btn" to="/menu">
            Xem thực đơn
          </Link>
        </div>
      </div>
    );
  }

  const { dish, chef, ingredients, categoryLabel } = data;

  return (
    <>
      <nav className="crumbs">
        <Link to="/menu">Thực đơn</Link> /{' '}
        <Link to={`/menu?category=${dish.category}`}>{categoryLabel}</Link> / {dish.name}
      </nav>

      <div className="detail">
        <div className="detail-media">
          {dish.imageUrl ? (
            <img src={dish.imageUrl} alt={dish.name} />
          ) : (
            <span className="media-ph" style={{ aspectRatio: '4/3' }}>
              {dish.name}
            </span>
          )}
        </div>

        <div>
          <div className="kicker">
            <span>{categoryLabel}</span>
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
              <dd>{categoryLabel}</dd>
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

          {ingredients.length > 0 ? (
            <div className="section">
              <h3>Nguyên liệu ({ingredients.length})</h3>
              <div className="tags">
                {ingredients.map((ing, i) => (
                  <span key={i} className="tag-item">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {chef ? (
            <div className="section">
              <h3>Đầu bếp phụ trách</h3>
              <div className="chef-card">
                <button
                  type="button"
                  className="chef-open"
                  onClick={() => setChefModalOpen(true)}
                  aria-haspopup="dialog"
                  aria-controls="chef-dialog"
                  title={`Xem thông tin ${chef.name}`}
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                >
                  <Avatar url={chef.avatarUrl} name={chef.name} size={74} />
                  <span>
                    <span className="role">{chef.specialty || 'Bếp trưởng'}</span>
                    <b className="chef-name">{chef.name}</b>
                  </span>
                </button>
                <div>{chef.bio ? <p>{chef.bio}</p> : null}</div>
              </div>

              <dialog
                id="chef-dialog"
                ref={dialogRef}
                className="chef-dialog"
                aria-labelledby="chef-dialog-name"
                onClick={(e) => {
                  if (e.target === dialogRef.current) setChefModalOpen(false);
                }}
              >
                <div className="chef-dialog-card">
                  <button
                    type="button"
                    className="chef-dialog-close"
                    onClick={() => setChefModalOpen(false)}
                    aria-label="Đóng"
                  >
                    ×
                  </button>
                  <Avatar url={chef.avatarUrl} name={chef.name} size={96} />
                  <span className="role">{chef.specialty || 'Bếp trưởng'}</span>
                  <h3 id="chef-dialog-name">{chef.name}</h3>
                  {chef.bio ? <p>{chef.bio}</p> : null}
                  {chef.experienceYears ? (
                    <p className="muted">Kinh nghiệm: {chef.experienceYears} năm</p>
                  ) : null}
                </div>
              </dialog>
            </div>
          ) : null}

          <div className="actions-row">
            <a className="btn btn-solid btn-lg" href="tel:19006868">
              Đặt bàn: 1900 6868
            </a>
            <Link className="btn btn-lg" to="/menu">
              Quay lại thực đơn
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};
