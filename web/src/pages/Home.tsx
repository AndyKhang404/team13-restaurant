import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dishesApi } from '../lib/resources';
import { useApi } from '../lib/useApi';
import { useAuth } from '../auth/AuthProvider';
import { canAccessAdmin } from '../auth/roles';
import { EmptyState, ErrorState, SkeletonFeat } from '../components/StateViews';
import { formatVnd } from '../lib/format';
import { categoryLabel, type Dish } from '../lib/types';

const TICKER = [
  'Mở cửa 09:00 — 22:00 mỗi ngày',
  '123 Nguyễn Văn Cừ, Q.5, TP.HCM',
  'Hotline 1900 6868',
  'Nguyên liệu tươi nhập mỗi sáng',
  'Nhận đặt tiệc & sự kiện',
];

function FeaturedCarousel({ items }: { items: Dish[] }) {
  const n = items.length;
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [dir, setDir] = useState(1);
  const timer = useRef<number | undefined>(undefined);
  const touch = useRef({ x: 0, y: 0 });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function goTo(target: number) {
    if (n < 2) return;
    const t = ((target % n) + n) % n;
    if (t === index) return;
    let d = t > index ? 1 : -1;
    if (index === n - 1 && t === 0) d = 1;
    if (index === 0 && t === n - 1) d = -1;
    setDir(d);
    setLeaving(index);
    setIndex(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLeaving(null), 780);
  }

  const pad = (v: number) => (v < 10 ? `0${v}` : `${v}`);
  const prev = items[(index - 1 + n) % n];
  const next = items[(index + 1) % n];

  return (
    <section className="feat">
      <div className="eyebrow">Món nổi bật trong tuần</div>

      <div className="feat-stage">
        {!(
          n < 2
        ) && (
          <>
            <button
              type="button"
              className={`feat-peek feat-peek--prev${prev?.imageUrl ? '' : ' is-blank'}`}
              onClick={() => goTo(index - 1)}
              aria-label="Xem món liền trước"
            >
              {prev?.imageUrl ? <img alt="" src={prev.imageUrl} /> : <img alt="" />}
            </button>
            <button
              type="button"
              className="btn btn-quiet feat-btn"
              data-dir="-1"
              onClick={() => goTo(index - 1)}
              aria-label="Món trước"
            >
              ←
            </button>
          </>
        )}

        <div
          className="feat-center"
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) touch.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const t = e.changedTouches[0];
            if (!t) return;
            const dx = t.clientX - touch.current.x;
            const dy = t.clientY - touch.current.y;
            if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(index + (dx < 0 ? 1 : -1));
          }}
        >
          {items.map((dish, k) => {
            const hidden = k !== index;
            const cls = `feat-slide${!hidden ? ' is-active' : ''}${
              leaving === k ? ' is-leaving' : ''
            }`;
            const slideDir = leaving === k ? -dir : dir;
            return (
              <article
                key={dish.id}
                className={cls}
                style={{ '--dir': slideDir } as React.CSSProperties}
                inert={hidden}
                aria-hidden={hidden}
              >
                <Link className="feat-media" to={`/dishes/${dish.slug}`}>
                  {dish.imageUrl ? (
                    <img src={dish.imageUrl} alt={dish.name} />
                  ) : (
                    <span className="media-ph">{dish.name}</span>
                  )}
                </Link>
                <div className="feat-info">
                  <div className="feat-meta">
                    <span>{categoryLabel(dish.category)}</span>
                    {dish.prepTimeMinutes ? <span>{dish.prepTimeMinutes} phút</span> : null}
                  </div>
                  <h3 className="feat-name">{dish.name}</h3>
                  {dish.description ? <p className="feat-desc">{dish.description}</p> : null}
                  <div className="feat-foot">
                    <span className="price">{formatVnd(dish.price)}</span>
                    <Link className="btn btn-solid" to={`/dishes/${dish.slug}`}>
                      Chi tiết
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!(n < 2) && (
          <>
            <button
              type="button"
              className="btn btn-quiet feat-btn"
              data-dir="1"
              onClick={() => goTo(index + 1)}
              aria-label="Món sau"
            >
              →
            </button>
            <button
              type="button"
              className={`feat-peek feat-peek--next${next?.imageUrl ? '' : ' is-blank'}`}
              onClick={() => goTo(index + 1)}
              aria-label="Xem món liền sau"
            >
              {next?.imageUrl ? <img alt="" src={next.imageUrl} /> : <img alt="" />}
            </button>
          </>
        )}
      </div>

      {!(n < 2) && (
        <div className="feat-status">
          <span className="feat-count" aria-live="polite">
            <b>{pad(index + 1)}</b> / {pad(n)}
          </span>
          <div className="feat-pips">
            {items.map((dish, k) => (
              <button
                key={dish.id}
                type="button"
                className={`feat-pip${k === index ? ' is-active' : ''}`}
                onClick={() => goTo(k)}
                aria-label={`Chọn món ${k + 1}`}
                aria-current={k === index ? 'true' : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => dishesApi.listPublic(), []);
  const featured = (data ?? []).filter((d) => d.isFeatured);
  const hero = featured[0];

  return (
    <div>
      <section className="hero hero-split">
        <div className="hero-text">
          <div className="eyebrow">Bếp mở cửa 09:00 — 22:00 mỗi ngày</div>
          <h1>Nhà hàng Việt, nấu theo mùa</h1>
          <p>
            Món Việt đậm vị quê nhà cùng món Âu tinh tế, nguyên liệu tươi trong ngày, đội ngũ đầu
            bếp nhiều năm kinh nghiệm. Đặt bàn và thưởng thức tại Team13 Restaurant.
          </p>
          <div className="actions-row">
            <Link className="btn btn-solid btn-lg" to="/dishes">
              Xem thực đơn
            </Link>
            <a className="btn btn-lg" href="tel:19006868">
              Đặt bàn: 1900 6868
            </a>
            {canAccessAdmin(user) ? (
              <Link className="btn btn-lg" to="/admin">
                Quản trị
              </Link>
            ) : user ? null : (
              <Link className="btn btn-lg" to="/login">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>

        {hero ? (
          <Link className="hero-art" to={`/dishes/${hero.slug}`}>
            {hero.imageUrl ? (
              <img src={hero.imageUrl} alt={hero.name} />
            ) : (
              <span className="media-ph">{hero.name}</span>
            )}
            <span className="price-tag">
              <em>{hero.isFeatured ? 'Món nổi bật' : 'Thực đơn'}</em>
              <b>{formatVnd(hero.price)}</b>
            </span>
          </Link>
        ) : null}
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...TICKER, ...TICKER].map((text, i) => (
            <span className="ticker-item" key={i}>
              {text}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonFeat />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : featured.length > 0 ? (
        <FeaturedCarousel items={featured} />
      ) : (
        <section className="feat">
          <div className="eyebrow">Món nổi bật trong tuần</div>
          <EmptyState title="Thực đơn đang được cập nhật" message="Các món mới sẽ sớm xuất hiện tại đây." />
          <div className="actions-row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-solid" to="/dishes">
              Xem thực đơn
            </Link>
          </div>
        </section>
      )}

      <div className="why">
        <div className="why-item">
          <span className="idx">01</span>
          <h3>Nguyên liệu tươi trong ngày</h3>
          <p>
            Thịt, cá, rau củ lấy từ nhà cung cấp uy tín mỗi sáng — không phẩm màu, nước dùng ninh
            từ hầm.
          </p>
        </div>
        <div className="why-item">
          <span className="idx">02</span>
          <h3>Đầu bếp nhiều năm kinh nghiệm</h3>
          <p>Đội ngũ đầu bếp Việt và Âu, hơn 10 năm đứng bếp nhà hàng, chăm chút từng đĩa món.</p>
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
    </div>
  );
}
