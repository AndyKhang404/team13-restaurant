import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  PAGE_SIZE,
  buildPagination,
  parsePaginationQuery,
  skipFor,
} from '../src/lib/pagination.js';

describe('pagination helpers', () => {
  it('uses 20 records per page by default', () => {
    expect(PAGE_SIZE).toBe(20);
    expect(buildPagination(1, 0).pageSize).toBe(20);
    expect(parsePaginationQuery({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('parses valid pages and page sizes', () => {
    expect(parsePaginationQuery({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects invalid page and pageSize values', () => {
    expect(() => parsePaginationQuery({ page: 'abc' })).toThrow();
    expect(() => parsePaginationQuery({ page: '0' })).toThrow();
    expect(() => parsePaginationQuery({ page: '1.5' })).toThrow();
    expect(() => parsePaginationQuery({ pageSize: '0' })).toThrow();
    expect(() => parsePaginationQuery({ pageSize: '101' })).toThrow();
  });

  it('preserves an out-of-range page and computes totalPages as zero for empty results', () => {
    const outOfRange = buildPagination(99, 45, { q: 'pho', category: 'main' });
    expect(outOfRange.page).toBe(99);
    expect(outOfRange.totalPages).toBe(3);
    expect(outOfRange.hasPrev).toBe(true);
    expect(outOfRange.hasNext).toBe(false);
    expect(outOfRange.baseQuery).toContain('q=pho');
    expect(outOfRange.baseQuery).toContain('category=main');

    const empty = buildPagination(1, 0);
    expect(empty.totalPages).toBe(0);
    expect(empty.hasNext).toBe(false);
  });

  it('computes the database offset from the requested page and pageSize', () => {
    expect(skipFor(1)).toBe(0);
    expect(skipFor(2)).toBe(20);
    expect(skipFor(3)).toBe(40);
    expect(skipFor(3, 50)).toBe(100);
  });
});

describe('GET /api/dishes server-side pagination', () => {
  const app = createApp();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the correct page window and returns pagination metadata', async () => {
    vi.spyOn(prisma.dish, 'count').mockResolvedValue(45);
    const findMany = vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

    const res = await request(app).get('/api/dishes?page=2&q=pho');

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      hasPrev: true,
      hasNext: true,
    });
  });

  it('uses the unfiltered record counter instead of recounting every page', async () => {
    const count = vi.spyOn(prisma.dish, 'count').mockResolvedValue(45);
    vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

    await request(app).get('/api/dishes?page=1');
    const res = await request(app).get('/api/dishes?page=2');

    expect(res.status).toBe(200);
    expect(count).toHaveBeenCalledTimes(1);
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      total: 45,
      totalPages: 3,
    });
  });

  it('returns an empty page without clamping when the requested page is too high', async () => {
    vi.spyOn(prisma.dish, 'count').mockResolvedValue(45);
    const findMany = vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

    const res = await request(app).get('/api/dishes?page=99');

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1960, take: 20 }));
    expect(res.body.data.pagination).toMatchObject({
      page: 99,
      totalPages: 3,
      hasPrev: true,
      hasNext: false,
    });
  });

  it('accepts a custom pageSize up to 100', async () => {
    vi.spyOn(prisma.dish, 'count').mockResolvedValue(120);
    const findMany = vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

    const res = await request(app).get('/api/dishes?page=2&pageSize=50');

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 50 }));
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      pageSize: 50,
      totalPages: 3,
      baseQuery: 'pageSize=50',
    });
  });

  it('returns VALIDATION_FAILED for invalid page or pageSize', async () => {
    const count = vi.spyOn(prisma.dish, 'count').mockResolvedValue(45);
    const findMany = vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

    const invalidPage = await request(app).get('/api/dishes?page=0');
    expect(invalidPage.status).toBe(200);
    expect(invalidPage.body).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });

    const invalidSize = await request(app).get('/api/dishes?pageSize=101');
    expect(invalidSize.status).toBe(200);
    expect(invalidSize.body).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });

    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reports totalPages 0 when the filtered result is empty', async () => {
    vi.spyOn(prisma.dish, 'count').mockResolvedValue(0);
    const findMany = vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

    const res = await request(app).get('/api/dishes');

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      total: 0,
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
    });
  });
});
