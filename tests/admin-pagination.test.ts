import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

vi.mock('../src/auth/middleware.js', () => ({
  loadUser: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const mockCount = vi.fn();
const mockFindMany = vi.fn();

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    dish: {
      count: (...args: unknown[]) => mockCount('dish', ...args),
      findMany: (...args: unknown[]) => mockFindMany('dish', ...args),
    },
    chef: {
      count: (...args: unknown[]) => mockCount('chef', ...args),
      findMany: (...args: unknown[]) => mockFindMany('chef', ...args),
    },
    ingredient: {
      count: (...args: unknown[]) => mockCount('ingredient', ...args),
      findMany: (...args: unknown[]) => mockFindMany('ingredient', ...args),
    },
    profile: {
      count: (...args: unknown[]) => mockCount('profile', ...args),
      findMany: (...args: unknown[]) => mockFindMany('profile', ...args),
    },
  },
}));

import { createApp } from '../src/app.js';

describe('Admin List Routes Pagination', () => {
  const app = createApp();

  it('dishes: redirects out-of-range page to last page keeping filters', async () => {
    mockCount.mockResolvedValue(25);
    const res = await request(app).get('/admin/dishes?page=999&category=main');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/dishes?category=main&page=3');
  });

  it('dishes: redirects invalid page to page 1', async () => {
    mockCount.mockResolvedValue(25);
    const res = await request(app).get('/admin/dishes?page=abc');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/dishes');
  });

  it('dishes: fetches correct skip and take for valid page', async () => {
    mockCount.mockResolvedValue(25);
    mockFindMany.mockResolvedValue([]);
    const res = await request(app).get('/admin/dishes?page=2');
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      'dish',
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  it('chefs: redirects out-of-range page to last page', async () => {
    mockCount.mockResolvedValue(15);
    const res = await request(app).get('/admin/chefs?page=999');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/chefs?page=2');
  });

  it('ingredients: redirects out-of-range page to last page', async () => {
    mockCount.mockResolvedValue(30);
    const res = await request(app).get('/admin/ingredients?page=999');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/ingredients?page=3');
  });

  it('users: redirects out-of-range page to last page', async () => {
    mockCount.mockResolvedValue(12);
    const res = await request(app).get('/admin/users?page=999');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users?page=2');
  });
});
