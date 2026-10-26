export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export type PageToken = number | 'gap';

/** Numbered pages with a compact `...` window for large page counts. */
export function pageWindow(page: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const visible = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) {
    visible.add(2);
    visible.add(3);
    visible.add(4);
  }
  if (page >= totalPages - 2) {
    visible.add(totalPages - 1);
    visible.add(totalPages - 2);
    visible.add(totalPages - 3);
  }

  const sorted = [...visible]
    .filter((candidate) => candidate >= 1 && candidate <= totalPages)
    .sort((a, b) => a - b);

  const tokens: PageToken[] = [];
  let previous = 0;
  for (const candidate of sorted) {
    if (previous && candidate - previous > 1) tokens.push('gap');
    tokens.push(candidate);
    previous = candidate;
  }
  return tokens;
}
