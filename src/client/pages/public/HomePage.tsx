import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { can } from '../../lib/permissions.js';
import { formatVnd, CATEGORY_LABELS } from '../../lib/format.js';
import type { DishItem } from '../../components/shared/DishCard.js';

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const [featured, setFeatured] = useState<DishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    apiFetch<{ featured: DishItem[] }>('/home')
      .then((data) => setFeatured(data.featured))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const total = featured.length;

  const goTo = (index: number) => {
    if (total === 0) return;
    const target = (index + total) % total;
    setCurrentIndex(target);
  };

  const prevIndex = (currentIndex - 1 + total) % total;
  const nextIndex = (currentIndex + 1) % total;
  const currentDish = featured[currentIndex];

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  return (
    <>
      <section className="hero hero-split">
        <div className="hero-text">
          <div className="eyebrow">Bếp mở cửa 09:00 — 22:00 mỗi ngày</div>
          <h1>Nhà hàng Việt, nấu theo mùa</h1>
          <p>
            Món Việt đậm vị quê nhà cùng món Âu tinh tế, nguyên liệu tươi trong ngày, đội ngũ đầu
            bếp nhiều năm kinh nghiệm. Đặt bàn và thưởng thức tại Team13 Restaurant.
          </p>
          <div className="actions-row">
            <Link className="btn btn-solid btn-lg" to="/menu">
              Xem thực đơn
            </Link>
            <a className="btn btn-lg" href="tel:19006868">
              Đặt bàn: 1900 6868
            </a>
            {user ? (
              can(user, 'admin:access') ? (
                <Link className="btn btn-lg" to="/admin">
                  Quản trị
                </Link>
              ) : null
            ) : (
              <Link className="btn btn-lg" to="/login">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>

        {featured.length > 0 && featured[0] ? (
          <Link className="hero-art" to={`/dishes/${featured[0].slug}`}>
            {featured[0].imageUrl ? (
              <img src={featured[0].imageUrl} alt={featured[0].name} />
            ) : (
              <span className="media-ph">{featured[0].name}</span>
            )}
            <span className="price-tag">
              <em>{featured[0].isFeatured ? 'Món nổi bật' : 'Thực đơn'}</em>
              <b>{formatVnd(featured[0].price)}</b>
            </span>
          </Link>
        ) : null}
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          <span className="ticker-item">Mở cửa 09:00 — 22:00 mỗi ngày</span>
          <span className="ticker-item">123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
          <span className="ticker-item">Hotline 1900 6868</span>
          <span className="ticker-item">Nguyên liệu tươi nhập mỗi sáng</span>
          <span className="ticker-item">Nhận đặt tiệc & sự kiện</span>
          <span className="ticker-item">Mở cửa 09:00 — 22:00 mỗi ngày</span>
          <span className="ticker-item">123 Nguyễn Văn Cừ, Q.5, TP.HCM</span>
          <span className="ticker-item">Hotline 1900 6868</span>
          <span className="ticker-item">Nguyên liệu tươi nhập mỗi sáng</span>
          <span className="ticker-item">Nhận đặt tiệc & sự kiện</span>
        </div>
      </div>

      {featured.length > 0 && currentDish ? (
        <section className="feat">
          <div className="eyebrow">Món nổi bật trong tuần</div>

          <div
            className="feat-stage"
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) touchStart.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const t = e.changedTouches[0];
              if (!t) return;
              const dx = t.clientX - touchStart.current.x;
              const dy = t.clientY - touchStart.current.y;
              if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) {
                goTo(currentIndex + (dx < 0 ? 1 : -1));
              }
            }}
          >
            {total > 1 ? (
              <button
                type="button"
                className="feat-peek feat-peek--prev"
                onClick={() => goTo(currentIndex - 1)}
                aria-label="Xem món liền trước"
              >
                {featured[prevIndex]?.imageUrl ? (
                  <img src={featured[prevIndex]?.imageUrl || ''} alt="" />
                ) : null}
              </button>
            ) : null}

            {total > 1 ? (
              <button
                type="button"
                className="btn btn-quiet feat-btn"
                onClick={() => goTo(currentIndex - 1)}
                aria-label="Món trước"
              >
                ←
              </button>
            ) : null}

            <div className="feat-center">
              <article className="feat-slide is-active">
                <Link className="feat-media" to={`/dishes/${currentDish.slug}`}>
                  {currentDish.imageUrl ? (
                    <img src={currentDish.imageUrl} alt={currentDish.name} />
                  ) : (
                    <span className="media-ph">{currentDish.name}</span>
                  )}
                </Link>
                <div className="feat-info">
                  <div className="feat-meta">
                    <span>{CATEGORY_LABELS[currentDish.category] ?? currentDish.category}</span>
                    {currentDish.prepTimeMinutes ? (
                      <span>{currentDish.prepTimeMinutes} phút</span>
                    ) : null}
                  </div>
                  <h3 className="feat-name">{currentDish.name}</h3>
                  {currentDish.description ? (
                    <p className="feat-desc">{currentDish.description}</p>
                  ) : null}
                  <div className="feat-foot">
                    <span className="price">{formatVnd(currentDish.price)}</span>
                    <Link className="btn btn-solid" to={`/dishes/${currentDish.slug}`}>
                      Chi tiết
                    </Link>
                  </div>
                </div>
              </article>
            </div>

            {total > 1 ? (
              <button
                type="button"
                className="btn btn-quiet feat-btn"
                onClick={() => goTo(currentIndex + 1)}
                aria-label="Món sau"
              >
                →
              </button>
            ) : null}

            {total > 1 ? (
              <button
                type="button"
                className="feat-peek feat-peek--next"
                onClick={() => goTo(currentIndex + 1)}
                aria-label="Xem món liền sau"
              >
                {featured[nextIndex]?.imageUrl ? (
                  <img src={featured[nextIndex]?.imageUrl || ''} alt="" />
                ) : null}
              </button>
            ) : null}
          </div>

          <div className="feat-status">
            <span className="feat-count" aria-live="polite">
              <b>{pad(currentIndex + 1)}</b> / {pad(total)}
            </span>
            <div className="feat-pips">
              {featured.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`feat-pip ${idx === currentIndex ? 'is-active' : ''}`.trim()}
                  onClick={() => goTo(idx)}
                  aria-label={`Chọn món ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="why">
        <div className="why-item">
          <span className="idx">01</span>
          <h3>Nguyên liệu tươi trong ngày</h3>
          <p>
            Thịt, cá, rau củ lấy từ nhà cung cấp uy tín mỗi sáng — không phẩm màu, nước dùng ninh từ
            hầm.
          </p>
        </div>
        <div className="why-item">
          <span className="idx">02</span>
          <h3>Đầu bếp nhiều năm kinh nghiệm</h3>
          <p>
            Đội ngũ đầu bếp Việt và Âu, hơn 10 năm đứng bếp nhà hàng, chăm chút từng đĩa món.
          </p>
        </div>
        <div className="why-item">
          <span className="idx">03</span>
          <h3>Phục vụ chuyên nghiệp</h3>
          <p>
            Không gian ấm cúng phù hợp gia đình và gặp mặt đối tác. Nhận đặt bàn qua hotline 1900
            6868.
          </p>
        </div>
      </div>

      {!loading && featured.length === 0 ? (
        <div className="empty">
          <b>Thực đơn đang được cập nhật</b>
          Các món mới sẽ sớm xuất hiện tại đây.
          <div className="actions-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
            <Link className="btn btn-solid" to="/menu">
              Xem thực đơn
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
};
