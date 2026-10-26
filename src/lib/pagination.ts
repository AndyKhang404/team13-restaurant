import { z } from 'zod';
import { badRequest } from './http.js';
import { toFieldErrors } from './validation.js';

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevPage: number;
  nextPage: number;
  /** Query string (without page) to preserve filters in pagination links, e.g. "q=pho". */
  baseQuery: string;
}

const blankToUndefined = (value: unknown) =>
  value === undefined || value === null || value === '' ? undefined : value;

const pageSchema = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: 'Trang phải là số' })
    .int('Trang phải là số nguyên')
    .min(1, 'Trang phải ít nhất 1')
    .optional()
    .default(1),
);

const pageSizeSchema = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: 'Số bản ghi mỗi trang phải là số' })
    .int('Số bản ghi mỗi trang phải là số nguyên')
    .min(1, 'Số bản ghi mỗi trang phải ít nhất 1')
    .max(MAX_PAGE_SIZE, `Số bản ghi mỗi trang không quá ${MAX_PAGE_SIZE}`)
    .optional()
    .default(PAGE_SIZE),
);

const PaginationQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export function parsePaginationQuery(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
} {
  const parsed = PaginationQuerySchema.safeParse({
    page: query.page,
    pageSize: query.pageSize,
  });
  if (!parsed.success) {
    throw badRequest(
      'Tham số phân trang không hợp lệ.',
      'VALIDATION_FAILED',
      toFieldErrors(parsed.error),
    );
  }
  return parsed.data;
}

export function buildPagination(
  page: number,
  total: number,
  filters: Record<string, string | undefined> = {},
  pageSize = PAGE_SIZE,
): Pagination {
  const totalPages = Math.ceil(total / pageSize);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prevPage: page - 1,
    nextPage: page + 1,
    baseQuery: params.toString(),
  };
}

export function skipFor(page: number, pageSize = PAGE_SIZE): number {
  return (page - 1) * pageSize;
}
