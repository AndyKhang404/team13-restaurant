import { Link } from 'react-router-dom';
import { formatVnd } from '../lib/format';
import { categoryLabel, type Dish } from '../lib/types';

export function DishCard({ dish }: { dish: Dish }) {
  return (
    <article className="dish-card">
      <Link className="dish-media fade-late" to={`/dishes/${dish.slug}`}>
        {dish.imageUrl ? (
          <img src={dish.imageUrl} alt={dish.name} loading="lazy" />
        ) : (
          <span className="media-ph">{dish.name}</span>
        )}
      </Link>
      <div className="dish-body fade-late">
        <div className="dish-meta">
          <span>{categoryLabel(dish.category)}</span>
          {dish.prepTimeMinutes ? <span>{dish.prepTimeMinutes} phút</span> : null}
        </div>
        <h3 className="dish-name">
          <Link to={`/dishes/${dish.slug}`}>{dish.name}</Link>
        </h3>
        {dish.description ? (
          <p className="dish-desc">{dish.description}</p>
        ) : null}
        <div className="dish-foot">
          <span className="price">{formatVnd(dish.price)}</span>
          <span style={{ display: 'flex', gap: '14px', alignItems: 'baseline' }}>
            {!dish.isAvailable ? <span className="status off">Ngừng bán</span> : null}
            <Link className="link-more" to={`/dishes/${dish.slug}`}>
              Chi tiết
            </Link>
          </span>
        </div>
      </div>
    </article>
  );
}
