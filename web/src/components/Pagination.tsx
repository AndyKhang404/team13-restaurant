import { useEffect, useRef } from 'react';
import type { Pagination, PagingMode } from '../lib/types';
import { PAGE_SIZE_OPTIONS, pageWindow } from '../lib/pagination';

const MODES: { value: PagingMode; label: string; short: string }[] = [
  { value: 'infinite', label: 'Cuộn vô hạn', short: 'Cuộn' },
  { value: 'loadMore', label: 'Tải thêm', short: 'Tải thêm' },
  { value: 'pages', label: 'Số trang', short: 'Số trang' },
];

interface ToolbarProps {
  mode: PagingMode;
  onMode: (mode: PagingMode) => void;
  page: number;
  pageSize: number;
  onPageSize: (pageSize: number) => void;
  pagination: Pagination | null;
  unit?: string;
}

function paginationSummary(
  page: number,
  pagination: Pagination | null,
  unit: string,
): string {
  if (!pagination) return 'Đang tải…';
  if (pagination.total === 0) return `0 ${unit}`;
  if (page > pagination.totalPages) {
    return `Trang ${page} vượt quá ${pagination.totalPages} — ${pagination.total} ${unit}`;
  }
  return `Trang ${page}/${pagination.totalPages} — ${pagination.total} ${unit}`;
}

export function PaginationToolbar({
  mode,
  onMode,
  page,
  pageSize,
  onPageSize,
  pagination,
  unit = 'bản ghi',
}: ToolbarProps) {
  const sizes = PAGE_SIZE_OPTIONS.includes(pageSize)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, pageSize].sort((a, b) => a - b);

  return (
    <div className="pagination-toolbar">
      <div className="pagination-summary" aria-live="polite">
        {paginationSummary(page, pagination, unit)}
      </div>
      <div className="pagination-controls">
        <label className="pagination-size">
          <span>Mỗi trang</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            aria-label="Số bản ghi mỗi trang"
          >
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="pagination-modes" role="group" aria-label="Kiểu phân trang">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={mode === item.value ? 'is-active' : undefined}
              aria-pressed={mode === item.value}
              title={item.label}
              onClick={() => onMode(item.value)}
            >
              {item.short}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface FooterProps {
  mode: PagingMode;
  page: number;
  pagination: Pagination | null;
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  moreError: Error | null;
  hasNext: boolean;
  onPage: (page: number) => void;
  onLoadMore: () => void;
  unit?: string;
}

export function PaginationFooter({
  mode,
  page,
  pagination,
  loading,
  loadingMore,
  error,
  moreError,
  hasNext,
  onPage,
  onLoadMore,
  unit = 'bản ghi',
}: FooterProps) {
  if (!pagination && loading) {
    return <div className="pagination-status">Đang tải…</div>;
  }
  if (!pagination || pagination.total === 0) return null;

  if (page > pagination.totalPages) {
    return (
      <div className="pagination-status pagination-out-of-range" role="status">
        Trang {page} vượt quá {pagination.totalPages} trang.
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() => onPage(pagination.totalPages)}
        >
          Về trang cuối
        </button>
      </div>
    );
  }

  if (mode === 'pages') {
    if (pagination.totalPages <= 1) {
      return <div className="pagination-status">Đã hiển thị tất cả {pagination.total} {unit}</div>;
    }
    const tokens = pageWindow(page, pagination.totalPages);
    return (
      <nav className="pager" aria-label="Phân trang">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || loading}
        >
          Trước
        </button>
        {tokens.map((token, index) =>
          token === 'gap' ? (
            <span key={`gap-${index}`} className="gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={token}
              type="button"
              className={token === page ? 'current' : undefined}
              aria-current={token === page ? 'page' : undefined}
              aria-label={`Trang ${token}`}
              onClick={() => onPage(token)}
              disabled={loading && token !== page}
            >
              {token}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={!hasNext || loading}
        >
          Sau
        </button>
      </nav>
    );
  }

  const remaining = Math.max(0, pagination.total - page * pagination.pageSize);

  if (mode === 'loadMore') {
    return (
      <div className="pagination-more">
        {moreError ? <PaginationMoreError error={moreError} onRetry={onLoadMore} /> : null}
        {hasNext ? (
          <button type="button" className="btn btn-quiet" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Đang tải…' : `Tải thêm (còn ${remaining} ${unit})`}
          </button>
        ) : (
          <div className="pagination-status">Đã hiển thị tất cả {pagination.total} {unit}</div>
        )}
      </div>
    );
  }

  return (
    <div className="pagination-infinite">
      {moreError ? (
        <PaginationMoreError error={moreError} onRetry={onLoadMore} />
      ) : (
        <InfiniteSentinel
          enabled={hasNext && !loadingMore}
          onTrigger={onLoadMore}
          loading={loadingMore}
          hasNext={hasNext}
          total={pagination.total}
          unit={unit}
        />
      )}
    </div>
  );
}

function PaginationMoreError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="pagination-error" role="alert">
      <span>{error.message}</span>
      <button type="button" className="btn btn-sm btn-quiet" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}

function InfiniteSentinel({
  enabled,
  onTrigger,
  loading,
  hasNext,
  total,
  unit,
}: {
  enabled: boolean;
  onTrigger: () => void;
  loading: boolean;
  hasNext: boolean;
  total: number;
  unit: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef(onTrigger);
  triggerRef.current = onTrigger;

  useEffect(() => {
    if (!enabled) return;
    const target = ref.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) triggerRef.current();
      },
      { rootMargin: '500px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled]);

  return (
    <div ref={ref} className="pagination-sentinel" aria-live="polite">
      {loading ? 'Đang tải thêm…' : hasNext ? 'Cuộn để tải thêm' : `Đã hiển thị tất cả ${total} ${unit}`}
    </div>
  );
}
