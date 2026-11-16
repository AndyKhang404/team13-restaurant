import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { Role } from '../src/generated/prisma/enums.js';

describe('Route-Level RBAC Enforcement', () => {
  const app = createApp();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupAuthMock(role: Role, userId = 'user-test-uuid') {
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockImplementation((_req: any, _res: any) => {
      return {
        auth: {
          getUser: vi.fn().mockImplementation(async (token: string) => {
            if (token === 'test-token') {
              return {
                data: {
                  user: {
                    id: userId,
                    email: `${role.toLowerCase()}@restaurant.com`,
                    user_metadata: { display_name: `${role} User` },
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

    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      id: userId,
      email: `${role.toLowerCase()}@restaurant.com`,
      displayName: `${role} User`,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  }

  describe('VIEWER Role', () => {
    it('denies VIEWER access to GET /api/stats with 403 FORBIDDEN', async () => {
      setupAuthMock(Role.VIEWER);

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('denies VIEWER access to POST /api/dishes with 403 FORBIDDEN', async () => {
      setupAuthMock(Role.VIEWER);

      const res = await request(app)
        .post('/api/dishes')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Pho Bo', price: 50000 });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('denies VIEWER access to GET /api/chefs with 403 FORBIDDEN', async () => {
      setupAuthMock(Role.VIEWER);

      const res = await request(app)
        .get('/api/chefs')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('denies VIEWER access to GET /api/users with 403 FORBIDDEN', async () => {
      setupAuthMock(Role.VIEWER);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('allows VIEWER to access public GET /api/dishes', async () => {
      setupAuthMock(Role.VIEWER);
      vi.spyOn(prisma.dish, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/dishes')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('STAFF Role', () => {
    it('allows STAFF access to GET /api/stats (admin:access)', async () => {
      setupAuthMock(Role.STAFF);
      vi.spyOn(prisma.dish, 'count').mockResolvedValue(5);
      vi.spyOn(prisma.chef, 'count').mockResolvedValue(2);
      vi.spyOn(prisma.ingredient, 'count').mockResolvedValue(10);
      vi.spyOn(prisma.profile, 'count').mockResolvedValue(20);
      vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('allows STAFF access to content management (POST /api/dishes passes permission check)', async () => {
      setupAuthMock(Role.STAFF);

      // Sending invalid payload to verify permission check passes and controller validation runs
      const res = await request(app)
        .post('/api/dishes')
        .set('Authorization', 'Bearer test-token')
        .send({ name: '', price: -10 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('denies STAFF access to GET /api/users with 403 FORBIDDEN (lacks user:manage)', async () => {
      setupAuthMock(Role.STAFF);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('denies STAFF access to PATCH /api/users/:id/role with 403 FORBIDDEN', async () => {
      setupAuthMock(Role.STAFF);

      const res = await request(app)
        .patch('/api/users/any-uuid/role')
        .set('Authorization', 'Bearer test-token')
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('ADMIN Role', () => {
    it('allows ADMIN access to GET /api/users (user:manage)', async () => {
      setupAuthMock(Role.ADMIN);
      vi.spyOn(prisma.profile, 'count').mockResolvedValue(3);
      vi.spyOn(prisma.profile, 'findMany').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.users).toBeDefined();
    });

    it('allows ADMIN access to GET /api/stats', async () => {
      setupAuthMock(Role.ADMIN);
      vi.spyOn(prisma.dish, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.chef, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.ingredient, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.profile, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([]);

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
