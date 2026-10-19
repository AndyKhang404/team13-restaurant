import { HttpError } from '../lib/api';
import type { ReactNode } from 'react';

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="empty">
      <b>{label}</b>
      Vui lòng chờ trong giây lát.
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const detail =
    error instanceof HttpError && error.status === 0
      ? 'Không kết nối được API. Kiểm tra server đang chạy và VITE_API_URL đúng chưa.'
      : error.message;
  return (
    <div className="alert error">
      <b>Lỗi</b>
      <span>{detail}</span>
      {onRetry && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function NotFoundState({
  message = 'Không tìm thấy.',
  title = 'Không tìm thấy',
  children,
}: {
  message?: string;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty" style={{ marginTop: 36 }}>
      <b>{title}</b>
      {message}
      {children && (
        <div className="actions-row" style={{ justifyContent: 'center', marginTop: 20 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, message }: { title?: string; message?: string }) {
  return (
    <div className="empty">
      <b>{title ?? 'Chưa có dữ liệu'}</b>
      {message}
    </div>
  );
}

/** The shimmer overlay used while a dish grid is loading. */
export function SkeletonGrid() {
  const widths = [88, 74, 80, 70];
  return (
    <div className="menu-skel" aria-hidden="true">
      <div className="skel-grid" style={{ marginTop: 22 }}>
        {widths.map((w, i) => (
          <div className="sk-card" key={i}>
            <div className="sk-media">
              <div className="sk" />
            </div>
            <div className="sk-body">
              <div className="sk-meta">
                <div className="sk" />
                <div className="sk" />
              </div>
              <div className="sk sk-title" style={{ width: `${w}%` }} />
              <div className="sk sk-sub" style={{ width: `${100 - w}%` }} />
              <div className="sk-foot">
                <div className="sk" />
                <div className="sk" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The shimmer overlay that mirrors the home page's featured dish selection carousel. */
export function SkeletonFeat() {
  return (
    <section className="feat feat-skel" aria-busy="true">
      <div className="eyebrow">Món nổi bật trong tuần</div>

      <div className="feat-stage">
        <div className="feat-peek feat-peek--prev is-blank" aria-hidden="true" />
        <div className="feat-center">
          <article className="feat-slide is-active" aria-hidden="true">
            <div className="feat-media">
              <span className="sk sk-media" />
            </div>
            <div className="feat-info">
              <div className="feat-meta">
                <span className="sk sk-chip" />
                <span className="sk sk-chip" />
              </div>
              <span className="sk sk-title" />
              <span className="sk sk-desc" />
              <span className="sk sk-desc is-short" />
              <div className="feat-foot">
                <span className="sk sk-price" />
                <span className="sk sk-buy" />
              </div>
            </div>
          </article>
        </div>
        <div className="feat-peek feat-peek--next is-blank" aria-hidden="true" />
      </div>

      <div className="feat-status">
        <span className="sk sk-count" />
        <div className="feat-pips">
          <span className="feat-pip is-active" />
          <span className="feat-pip" />
          <span className="feat-pip" />
        </div>
      </div>
    </section>
  );
}

/** The shimmer overlay used inside an admin table while rows load. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i}>
          <div className="sk w80" />
          <div className="sk thumb-sk" />
          <div className="sk grow" />
          <div className="sk w80" />
          <div className="sk w80" />
        </div>
      ))}
    </div>
  );
}
