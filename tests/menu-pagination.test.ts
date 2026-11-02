import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

vi.mock('../src/lib/prisma.js', () => {
  return {
    prisma: {
      dish: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

describe('Menu pagination (/menu)', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.dish.count).mockResolvedValue(30);
    vi.mocked(prisma.dish.findMany).mockResolvedValue([]);
  });

  it('redirects out-of-range page to the last page preserving filters', async () => {
    const res = await request(app).get('/menu?page=999&q=pho');
    expect(res.status).toBe(302);
    expect(res.header.location).toBe('/menu?q=pho&page=3');
  });

  it('redirects invalid page param (e.g. non-numeric) to page 1', async () => {
    const res = await request(app).get('/menu?page=abc');
    expect(res.status).toBe(302);
    expect(res.header.location).toBe('/menu');
  });

  it('renders page 2 and passes correct skip/take to prisma.dish.findMany', async () => {
    const res = await request(app).get('/menu?page=2');
    expect(res.status).toBe(200);
    expect(prisma.dish.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 12,
        take: 12,
      }),
    );
  });

  it('uses default sort with id asc tie-breaker and handles unknown sort', async () => {
    await request(app).get('/menu');
    expect(prisma.dish.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 0,
        take: 12,
      }),
    );

    await request(app).get('/menu?sort=invalid-key');
    expect(prisma.dish.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('uses explicit sort orders with id asc tie-breaker', async () => {
    await request(app).get('/menu?sort=price-asc');
    expect(prisma.dish.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ price: 'asc' }, { id: 'asc' }],
      }),
    );

    await request(app).get('/menu?sort=newest');
    expect(prisma.dish.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('preserves stacked category, search query, and sort filters on redirect', async () => {
    const res = await request(app).get('/menu?category=main&q=com&sort=price-desc&page=99');
    expect(res.status).toBe(302);
    expect(res.header.location).toBe('/menu?category=main&q=com&sort=price-desc&page=3');
  });

  it('renders empty state when total is 0', async () => {
    vi.mocked(prisma.dish.count).mockResolvedValue(0);
    const res = await request(app).get('/menu?q=khong-co-mon');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Không tìm thấy món nào');
    expect(res.text).toContain('/menu');
  });
});
