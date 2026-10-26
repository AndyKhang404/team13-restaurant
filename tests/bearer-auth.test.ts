import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { Role } from '../src/generated/prisma/enums.js';

describe('Bearer Auth & Refactored /api/* Endpoints', () => {
  const app = createApp();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBearerToken helper', () => {
    it('extracts token from standard Bearer header', () => {
      const req = { headers: { authorization: 'Bearer secret123' } } as any;
      expect(supabaseLib.getBearerToken(req)).toBe('secret123');
    });

    it('is case-insensitive for bearer prefix', () => {
      const req = { headers: { authorization: 'bearer token-abc' } } as any;
      expect(supabaseLib.getBearerToken(req)).toBe('token-abc');
    });

    it('trims excess whitespace around token', () => {
      const req = { headers: { authorization: 'Bearer   spaced-token   ' } } as any;
      expect(supabaseLib.getBearerToken(req)).toBe('spaced-token');
    });

    it('returns null if authorization header is absent or non-Bearer', () => {
      expect(supabaseLib.getBearerToken({ headers: {} } as any)).toBeNull();
      expect(supabaseLib.getBearerToken({ headers: { authorization: 'Basic user:pass' } } as any)).toBeNull();
      expect(supabaseLib.getBearerToken({ headers: { authorization: 'Bearer' } } as any)).toBeNull();
    });
  });

  describe('Unauthenticated access to protected /api/* endpoints', () => {
    it('rejects GET /api/stats with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/stats');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects GET /api/chefs with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/chefs');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects GET /api/ingredients with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/ingredients');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects GET /api/users with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('retains backward compatibility aliases under /api/admin/*', async () => {
      const statsRes = await request(app).get('/api/admin/stats');
      expect(statsRes.status).toBe(401);
      expect(statsRes.body.error).toMatchObject({ code: 'UNAUTHORIZED' });

      const chefsRes = await request(app).get('/api/admin/chefs');
      expect(chefsRes.status).toBe(401);
      expect(chefsRes.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('Public access to GET /api/dishes', () => {
    it('returns 200 with dishes array and pagination metadata without authentication', async () => {
      vi.spyOn(prisma.dish, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Pho Bo',
          slug: 'pho-bo',
          price: 85000 as any,
          category: 'MAIN_COURSE' as any,
          description: 'Delicious',
          imageUrl: null,
          isAvailable: true,
          isFeatured: true,
          prepTimeMinutes: 15,
          chefId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          chef: null,
        } as any,
      ]);

      const res = await request(app).get('/api/dishes');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data.dishes)).toBe(true);
      expect(res.body.data.dishes[0].name).toBe('Pho Bo');
      expect(res.body.data.pagination).toBeDefined();
    });
  });

  describe('CSRF bypass for Bearer token requests', () => {
    it('rejects mutating POST requests without Bearer token or CSRF token with 403 CSRF_INVALID', async () => {
      const res = await request(app).post('/api/dishes').send({ name: 'Test' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({ code: 'CSRF_INVALID' });
    });

    it('bypasses CSRF when Authorization: Bearer is present (falls through to auth check -> 401)', async () => {
      const res = await request(app)
        .post('/api/dishes')
        .set('Authorization', 'Bearer invalid-dummy-token')
        .send({ name: 'Test' });

      // Note: Because Bearer header is present, CSRF protection is bypassed.
      // Since dummy token is invalid, loadUser leaves req.user = null,
      // and requirePermission('dish:create') rejects with 401 UNAUTHORIZED (not 403 CSRF_INVALID).
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('Authenticated requests with valid Bearer token', () => {
    beforeEach(() => {
      // Mock createSupabaseForRequest to return a mock Supabase client
      vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockImplementation((_req: any, _res: any) => {
        return {
          auth: {
            getUser: vi.fn().mockImplementation(async (token: string) => {
              if (token === 'valid-admin-token') {
                return {
                  data: {
                    user: {
                      id: 'user-admin-uuid',
                      email: 'admin@restaurant.com',
                      user_metadata: { display_name: 'Admin User' },
                    },
                  },
                  error: null,
                };
              }
              return { data: { user: null }, error: new Error('Invalid token') };
            }),
            getClaims: vi.fn().mockResolvedValue({ data: null, error: new Error('No session') }),
          },
        } as any;
      });

      // Mock prisma profile
      vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
        id: 'user-admin-uuid',
        email: 'admin@restaurant.com',
        displayName: 'Admin User',
        role: Role.ADMIN,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });

    it('allows access to GET /api/stats with valid Bearer token', async () => {
      vi.spyOn(prisma.dish, 'count').mockResolvedValue(10);
      vi.spyOn(prisma.chef, 'count').mockResolvedValue(3);
      vi.spyOn(prisma.ingredient, 'count').mockResolvedValue(25);
      vi.spyOn(prisma.profile, 'count').mockResolvedValue(100);
      vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', 'Bearer valid-admin-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.stats).toEqual({
        dishCount: 10,
        chefCount: 3,
        ingredientCount: 25,
        userCount: 100,
      });
    });

    it('allows access to GET /api/chefs with valid Bearer token', async () => {
      vi.spyOn(prisma.chef, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.chef, 'findMany').mockResolvedValue([
        {
          id: 'chef-uuid-1',
          name: 'Chef Gordon',
          specialty: 'Head Chef',
          bio: 'Legendary chef',
          experienceYears: 20,
          phone: null,
          imageUrl: null,
          isActive: true,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);

      const res = await request(app)
        .get('/api/chefs')
        .set('Authorization', 'Bearer valid-admin-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.chefs).toHaveLength(1);
      expect(res.body.data.chefs[0].name).toBe('Chef Gordon');
    });

    it('mutating POST with valid Bearer token bypasses CSRF and reaches controller validation', async () => {
      // Send an invalid dish payload; since CSRF and auth pass, the controller's validation runs
      // returning business validation error: HTTP 200 with { ok: false, error: { code: 'VALIDATION_FAILED' } }
      const res = await request(app)
        .post('/api/dishes')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          name: '', // Empty name triggers validation failure
          price: -10,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
