export const PAGE_SIZE = 10;

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevPage: number;
  nextPage: number;
  /** Query string (without page) to preserve filters in pagination links, e.g. "q=pho&deleted=1". */
  baseQuery: string;
}

export function parsePage(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function buildPagination(
  page: number,
  total: number,
  filters: Record<string, string | undefined> = {},
  pageSize = PAGE_SIZE,
): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  return {
    page: current,
    pageSize,
    total,
    totalPages,
    hasPrev: current > 1,
    hasNext: current < totalPages,
    prevPage: current - 1,
    nextPage: current + 1,
    baseQuery: params.toString(),
  };
}

export function skipFor(page: number, pageSize = PAGE_SIZE): number {
  return (page - 1) * pageSize;
}
