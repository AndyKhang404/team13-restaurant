interface PanelPagerProps {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}

/** Client-side pager that mirrors the old SSR `pagination` partial. */
export function PanelPager({ page, totalPages, total, onPage }: PanelPagerProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="panel-foot">
      Hiển thị trang {page} / {totalPages} — tổng {total} bản ghi
      <div className="pager">
        {page > 1 ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onPage(page - 1);
            }}
          >
            Trước
          </a>
        ) : (
          <span>Trước</span>
        )}
        <span className="current">{page}</span>
        {page < totalPages ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onPage(page + 1);
            }}
          >
            Sau
          </a>
        ) : (
          <span>Sau</span>
        )}
      </div>
    </div>
  );
}
