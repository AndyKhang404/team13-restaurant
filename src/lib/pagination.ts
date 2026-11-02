export const ADMIN_PAGE_SIZE = 10;
export const MENU_PAGE_SIZE = 12;

export type Filters = Record<string, string | undefined>;

/** URL for a page; page 1 omits the `page` param. Empty filter values are dropped. */
export function pageUrl(basePath: string, filters: Filters, page: number): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== '') {
      params.set(key, val);
    }
  }
  if (page > 1) {
    params.set('page', String(page));
  }
  const qs = params.toString();
  if (!qs) return basePath;
  const sep = basePath.includes('?') ? '&' : '?';
  return `${basePath}${sep}${qs}`;
}

/** Decide which page to show, or whether to redirect. `total` must already be counted. */
export function resolvePage(
  raw: unknown,
  total: number,
  pageSize: number,
): { page: number; redirectPage: number | null } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (raw === undefined || raw === '') {
    return { page: 1, redirectPage: null };
  }
  if (typeof raw === 'string' && /^[1-9]\d*$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    if (n <= totalPages) {
      return { page: n, redirectPage: null };
    }
    return { page: totalPages, redirectPage: totalPages };
  }
  return { page: 1, redirectPage: 1 };
}

export type PageItem =
  { kind: 'page'; number: number; href: string; current: boolean } | { kind: 'gap' };

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string; // '' when not applicable
  items: PageItem[];
  // Temporary backward-compatibility fields for unmigrated callers
  prevPage?: number;
  nextPage?: number;
  baseQuery?: string;
}

export interface BuildPaginationOptions {
  basePath: string;
  filters: Filters;
  page: number;
  total: number;
  pageSize: number;
}

export function buildPagination(opts: BuildPaginationOptions): Pagination;
export function buildPagination(
  page: number,
  total: number,
  filters?: Filters,
  pageSize?: number,
): Pagination;
export function buildPagination(
  optsOrPage: BuildPaginationOptions | number,
  totalArg?: number,
  filtersArg?: Filters,
  pageSizeArg?: number,
): Pagination {
  const opts: BuildPaginationOptions =
    typeof optsOrPage === 'object'
      ? optsOrPage
      : {
          basePath: '',
          filters: filtersArg ?? {},
          page: optsOrPage,
          total: totalArg ?? 0,
          pageSize: pageSizeArg ?? ADMIN_PAGE_SIZE,
        };

  const { basePath, filters, page, total, pageSize } = opts;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  const hasPrev = clampedPage > 1;
  const hasNext = clampedPage < totalPages;
  const prevHref = hasPrev ? pageUrl(basePath, filters, clampedPage - 1) : '';
  const nextHref = hasNext ? pageUrl(basePath, filters, clampedPage + 1) : '';

  const pageNumbers = new Set<number>();
  pageNumbers.add(1);
  pageNumbers.add(totalPages);
  if (clampedPage - 1 >= 1) pageNumbers.add(clampedPage - 1);
  pageNumbers.add(clampedPage);
  if (clampedPage + 1 <= totalPages) pageNumbers.add(clampedPage + 1);

  const sorted = Array.from(pageNumbers).sort((a, b) => a - b);
  const items: PageItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (i > 0) {
      const prev = sorted[i - 1]!;
      const diff = p - prev;
      if (diff === 2) {
        const skipped = prev + 1;
        items.push({
          kind: 'page',
          number: skipped,
          href: pageUrl(basePath, filters, skipped),
          current: skipped === clampedPage,
        });
      } else if (diff > 2) {
        items.push({ kind: 'gap' });
      }
    }
    items.push({
      kind: 'page',
      number: p,
      href: pageUrl(basePath, filters, p),
      current: p === clampedPage,
    });
  }

  const legacyParams = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) legacyParams.set(k, v);
  }

  return {
    page: clampedPage,
    pageSize,
    total,
    totalPages,
    hasPrev,
    hasNext,
    prevHref,
    nextHref,
    items,
    prevPage: Math.max(1, clampedPage - 1),
    nextPage: Math.min(totalPages, clampedPage + 1),
    baseQuery: legacyParams.toString(),
  };
}

export function skipFor(page: number, pageSize: number = ADMIN_PAGE_SIZE): number {
  return Math.max(0, (page - 1) * pageSize);
}

// Temporary backwards-compatibility exports for unmigrated routes
export const PAGE_SIZE = ADMIN_PAGE_SIZE;
export function parsePage(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
