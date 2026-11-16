import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { ProfileStatus, Role } from '../src/generated/prisma/enums.js';
import { clearRevocationState, isTokenRevoked } from '../src/auth/token-revocation.js';

describe('Route-Level RBAC Enforcement', () => {
  const app = createApp();

  afterEach(() => {
    clearRevocationState();
    vi.restoreAllMocks();
  });

  function setupAuthMock(
    role: Role,
    userId = 'user-test-uuid',
    status: ProfileStatus = ProfileStatus.ACTIVE,
  ) {
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
      status,
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

  describe('ABAC Enforcement', () => {
    const STAFF_A = '11111111-1111-4111-8111-111111111111';
    const STAFF_B = '22222222-2222-4222-8222-222222222222';
    const ADMIN_1 = '33333333-3333-4333-8333-333333333333';
    const ADMIN_2 = '44444444-4444-4444-8444-444444444444';
    const ROW_ID = '55555555-5555-4555-8555-555555555555';

    describe('Account Status (SUSPENDED)', () => {
      it('returns 403 ACCOUNT_SUSPENDED for suspended ADMIN/STAFF/VIEWER on authenticated routes', async () => {
        setupAuthMock(Role.ADMIN, ADMIN_1, ProfileStatus.SUSPENDED);
        const statsRes = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer test-token');
        expect(statsRes.status).toBe(403);
        expect(statsRes.body.error).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });

        setupAuthMock(Role.STAFF, STAFF_A, ProfileStatus.SUSPENDED);
        const dishRes = await request(app)
          .post('/api/dishes')
          .set('Authorization', 'Bearer test-token')
          .send({ name: 'Pho Bo', price: 50000 });
        expect(dishRes.status).toBe(403);
        expect(dishRes.body.error).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });

        setupAuthMock(Role.VIEWER, STAFF_B, ProfileStatus.SUSPENDED);
        const meDeleteRes = await request(app)
          .delete('/api/auth/me')
          .set('Authorization', 'Bearer test-token')
          .send({ email: 'viewer@restaurant.com' });
        expect(meDeleteRes.status).toBe(403);
        expect(meDeleteRes.body.error).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
      });

      it('rejects suspended user login with 403 ACCOUNT_SUSPENDED', async () => {
        const signOutMock = vi.fn().mockResolvedValue({ error: null });
        vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue({
          auth: {
            signInWithPassword: vi.fn().mockResolvedValue({
              data: { user: { id: STAFF_A, email: 'staff@restaurant.com' }, session: { access_token: 'tok' } },
              error: null,
            }),
            signOut: signOutMock,
          },
        } as never);
        vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
          id: STAFF_A,
          email: 'staff@restaurant.com',
          role: Role.STAFF,
          status: ProfileStatus.SUSPENDED,
        } as never);

        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: 'staff@restaurant.com', password: 'Password123!' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
        expect(signOutMock).toHaveBeenCalled();
      });
    });

    describe('STAFF Ownership on Dishes, Chefs, and Ingredients', () => {
      it('sets createdBy from req.user.id on create and ignores body-supplied createdBy', async () => {
        setupAuthMock(Role.STAFF, STAFF_A);
        const createSpy = vi.spyOn(prisma.chef, 'create').mockResolvedValue({
          id: ROW_ID,
          name: 'Chef A',
          specialty: null,
          bio: null,
          experienceYears: 5,
          phone: null,
          avatarUrl: null,
          isActive: true,
          createdBy: STAFF_A,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } as never);

        const res = await request(app)
          .post('/api/chefs')
          .set('Authorization', 'Bearer test-token')
          .send({ name: 'Chef A', experienceYears: 5, isActive: 'true', createdBy: STAFF_B });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ createdBy: STAFF_A }),
          }),
        );
        expect(res.body.data.chef.permissions).toEqual({
          canUpdate: true,
          canDelete: false,
          canRestore: false,
        });
      });

      it('denies STAFF PATCH/restore on another user or legacy null-owner row with 403 NOT_OWNER and DELETE with 403 FORBIDDEN', async () => {
        setupAuthMock(Role.STAFF, STAFF_A);
        vi.spyOn(prisma.dish, 'findUnique').mockResolvedValue({
          id: ROW_ID,
          createdBy: STAFF_B,
          deletedAt: null,
        } as never);

        const patchRes = await request(app)
          .patch(`/api/dishes/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token')
          .send({ name: 'Updated' });
        expect(patchRes.status).toBe(403);
        expect(patchRes.body.error).toMatchObject({ code: 'NOT_OWNER' });

        const delRes = await request(app)
          .delete(`/api/dishes/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');
        expect(delRes.status).toBe(403);
        expect(delRes.body.error).toMatchObject({ code: 'FORBIDDEN' });

        vi.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue({
          id: ROW_ID,
          createdBy: null,
          deletedAt: new Date(),
        } as never);
        const restoreRes = await request(app)
          .post(`/api/ingredients/${ROW_ID}/restore`)
          .set('Authorization', 'Bearer test-token');
        expect(restoreRes.status).toBe(403);
        expect(restoreRes.body.error).toMatchObject({ code: 'NOT_OWNER' });
      });

      it('allows STAFF to PATCH/restore their own rows, while denying DELETE on own rows with 403 FORBIDDEN', async () => {
        setupAuthMock(Role.STAFF, STAFF_A);
        const ownChef = {
          id: ROW_ID,
          name: 'Chef A',
          specialty: null,
          bio: null,
          experienceYears: 3,
          phone: null,
          avatarUrl: null,
          isActive: true,
          createdBy: STAFF_A,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        vi.spyOn(prisma.chef, 'findUnique').mockResolvedValue(ownChef as never);
        vi.spyOn(prisma.chef, 'update').mockResolvedValue({
          ...ownChef,
          name: 'Chef A Updated',
        } as never);

        const patchRes = await request(app)
          .patch(`/api/chefs/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token')
          .send({ name: 'Chef A Updated', experienceYears: 3, isActive: 'true' });
        expect(patchRes.status).toBe(200);
        expect(patchRes.body.ok).toBe(true);

        const delRes = await request(app)
          .delete(`/api/chefs/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');
        expect(delRes.status).toBe(403);
        expect(delRes.body.error).toMatchObject({ code: 'FORBIDDEN' });

        vi.spyOn(prisma.chef, 'findUnique').mockResolvedValue({
          ...ownChef,
          deletedAt: new Date(),
        } as never);
        vi.spyOn(prisma.chef, 'update').mockResolvedValue({
          ...ownChef,
          deletedAt: null,
        } as never);

        const restoreRes = await request(app)
          .post(`/api/chefs/${ROW_ID}/restore`)
          .set('Authorization', 'Bearer test-token');
        expect(restoreRes.status).toBe(200);
        expect(restoreRes.body.ok).toBe(true);
        expect(restoreRes.body.data.chef.permissions).toEqual({
          canUpdate: true,
          canDelete: false,
          canRestore: false,
        });
      });

      it('allows ADMIN to mutate legacy null-owner and other-user rows', async () => {
        setupAuthMock(Role.ADMIN, ADMIN_1);
        const legacyIng = {
          id: ROW_ID,
          name: 'Legacy Salt',
          unit: 'g',
          stockQuantity: 10,
          pricePerUnit: 1000,
          imageUrl: null,
          isAvailable: true,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        vi.spyOn(prisma.ingredient, 'findUnique').mockResolvedValue(legacyIng as never);
        vi.spyOn(prisma.ingredient, 'update').mockResolvedValue({
          ...legacyIng,
          deletedAt: new Date(),
        } as never);

        const res = await request(app)
          .delete(`/api/ingredients/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      });
    });

    describe('Edit-form GET ABAC, PENDING status, and Dish field ABAC', () => {
      it('denies PENDING accounts on protected routes with 403 ACCOUNT_NOT_ACTIVATED', async () => {
        setupAuthMock(Role.STAFF, STAFF_A, ProfileStatus.PENDING);

        const res = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer test-token');
        expect(res.status).toBe(403);
        expect(res.body.error).toMatchObject({ code: 'ACCOUNT_NOT_ACTIVATED' });
      });

      it('gates GET /api/chefs/:id and GET /api/ingredients/:id by ownership (404 missing, 403 NOT_OWNER)', async () => {
        setupAuthMock(Role.STAFF, STAFF_A);

        vi.spyOn(prisma.chef, 'findUnique')
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);
        const missingChef = await request(app)
          .get(`/api/chefs/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');
        expect(missingChef.body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

        vi.spyOn(prisma.chef, 'findUnique').mockResolvedValueOnce({
          id: ROW_ID,
          createdBy: STAFF_B,
          deletedAt: null,
        } as never);
        const otherChef = await request(app)
          .get(`/api/chefs/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');
        expect(otherChef.status).toBe(403);
        expect(otherChef.body.error).toMatchObject({ code: 'NOT_OWNER' });

        vi.spyOn(prisma.ingredient, 'findUnique').mockResolvedValueOnce({
          id: ROW_ID,
          createdBy: STAFF_B,
          deletedAt: null,
        } as never);
        const otherIng = await request(app)
          .get(`/api/ingredients/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');
        expect(otherIng.status).toBe(403);
        expect(otherIng.body.error).toMatchObject({ code: 'NOT_OWNER' });
      });

      it('gates GET /api/dishes/form-deps?dishId= by ownership while leaving new-form deps open to STAFF', async () => {
        setupAuthMock(Role.STAFF, STAFF_A);

        vi.spyOn(prisma.chef, 'findMany').mockResolvedValue([]);
        vi.spyOn(prisma.ingredient, 'findMany').mockResolvedValue([]);
        const newDeps = await request(app)
          .get('/api/dishes/form-deps')
          .set('Authorization', 'Bearer test-token');
        expect(newDeps.status).toBe(200);
        expect(newDeps.body.ok).toBe(true);

        vi.spyOn(prisma.dish, 'findUnique').mockResolvedValueOnce(null);
        const missingDish = await request(app)
          .get(`/api/dishes/form-deps?dishId=${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');
        expect(missingDish.body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

        vi.spyOn(prisma.dish, 'findUnique').mockResolvedValueOnce({
          id: ROW_ID,
          createdBy: STAFF_B,
          deletedAt: null,
        } as never);
        const otherDish = await request(app)
          .get(`/api/dishes/form-deps?dishId=${ROW_ID}`)
          .set('Authorization', 'Bearer test-token');
        expect(otherDish.status).toBe(403);
        expect(otherDish.body.error).toMatchObject({ code: 'NOT_OWNER' });
      });

      it('blocks STAFF from setting/changing chefId or isFeatured on dishes with 403 FORBIDDEN', async () => {
        setupAuthMock(Role.STAFF, STAFF_A);
        const chefUuid = '77777777-7777-4777-8777-777777777777';

        const createRes = await request(app)
          .post('/api/dishes')
          .set('Authorization', 'Bearer test-token')
          .send({
            name: 'Pho Bo',
            price: 55000,
            category: 'main',
            isAvailable: true,
            isFeatured: true,
            chefId: chefUuid,
          });
        expect(createRes.status).toBe(403);
        expect(createRes.body.error).toMatchObject({
          code: 'FORBIDDEN',
          fields: {
            chefId: expect.any(String),
            isFeatured: expect.any(String),
          },
        });

        vi.spyOn(prisma.dish, 'findUnique').mockResolvedValue({
          id: ROW_ID,
          slug: 'pho-bo',
          chefId: null,
          isFeatured: false,
          imageUrl: null,
          createdBy: STAFF_A,
          deletedAt: null,
        } as never);

        const patchRes = await request(app)
          .patch(`/api/dishes/${ROW_ID}`)
          .set('Authorization', 'Bearer test-token')
          .send({
            name: 'Pho Bo',
            price: 55000,
            category: 'main',
            isAvailable: true,
            isFeatured: true,
          });
        expect(patchRes.status).toBe(403);
        expect(patchRes.body.error).toMatchObject({
          code: 'FORBIDDEN',
          fields: {
            isFeatured: expect.any(String),
          },
        });
      });
    });

    describe('Per-row permissions & createdBy visibility', () => {
      it('strips createdBy and omits permissions for public GET /api/dishes', async () => {
        vi.spyOn(prisma.dish, 'count').mockResolvedValue(1);
        vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([
          {
            id: ROW_ID,
            name: 'Pho Bo',
            slug: 'pho-bo',
            description: null,
            imageUrl: null,
            price: 50000,
            category: 'main',
            isAvailable: true,
            isFeatured: false,
            prepTimeMinutes: 10,
            chefId: null,
            createdBy: STAFF_A,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            chef: { id: 'c1', name: 'Chef', createdBy: STAFF_A },
          } as never,
        ]);

        const res = await request(app).get('/api/dishes');
        expect(res.status).toBe(200);
        const dish = res.body.data.dishes[0];
        expect(dish.createdBy).toBeUndefined();
        expect(dish.permissions).toBeUndefined();
        expect(dish.chef.createdBy).toBeUndefined();
      });

      it('includes per-row permissions for STAFF on GET /api/dishes', async () => {
        setupAuthMock(Role.STAFF, STAFF_A);
        vi.spyOn(prisma.dish, 'count').mockResolvedValue(2);
        vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([
          {
            id: ROW_ID,
            name: 'Own Dish',
            slug: 'own-dish',
            price: 50000,
            category: 'main',
            isAvailable: true,
            isFeatured: false,
            createdBy: STAFF_A,
            deletedAt: null,
            chef: null,
          } as never,
          {
            id: '66666666-6666-4666-8666-666666666666',
            name: 'Other Dish',
            slug: 'other-dish',
            price: 60000,
            category: 'main',
            isAvailable: true,
            isFeatured: false,
            createdBy: STAFF_B,
            deletedAt: null,
            chef: null,
          } as never,
        ]);

        const res = await request(app)
          .get('/api/dishes')
          .set('Authorization', 'Bearer test-token');

        expect(res.status).toBe(200);
        expect(res.body.data.dishes[0].permissions).toEqual({
          canUpdate: true,
          canDelete: false,
          canRestore: false,
        });
        expect(res.body.data.dishes[1].permissions).toEqual({
          canUpdate: false,
          canDelete: false,
          canRestore: false,
        });
      });
    });

    describe('Admin User Management Guards (Status & Last Active Admin)', () => {
      it('denies self-suspend with 403 SELF_MODIFY', async () => {
        setupAuthMock(Role.ADMIN, ADMIN_1);

        const res = await request(app)
          .patch(`/api/users/${ADMIN_1}/status`)
          .set('Authorization', 'Bearer test-token')
          .send({ status: ProfileStatus.SUSPENDED });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatchObject({ code: 'SELF_MODIFY' });
      });

      it('blocks suspending the last active ADMIN with LAST_ADMIN inside a transaction', async () => {
        setupAuthMock(Role.ADMIN, ADMIN_1);
        const txMock = {
          profile: {
            findUnique: vi.fn().mockResolvedValue({
              id: ADMIN_2,
              email: 'admin2@restaurant.com',
              role: Role.ADMIN,
              status: ProfileStatus.ACTIVE,
            }),
            update: vi.fn(),
          },
          $queryRaw: vi.fn().mockResolvedValue([{ id: ADMIN_2 }]),
        };
        vi.spyOn(prisma, '$transaction').mockImplementation(((
          fn: (tx: typeof txMock) => Promise<unknown>,
        ) => fn(txMock)) as never);

        const res = await request(app)
          .patch(`/api/users/${ADMIN_2}/status`)
          .set('Authorization', 'Bearer test-token')
          .send({ status: ProfileStatus.SUSPENDED });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(false);
        expect(res.body.error).toMatchObject({ code: 'LAST_ADMIN' });
        expect(txMock.profile.update).not.toHaveBeenCalled();
      });

      it('suspends another ADMIN when another active ADMIN remains and revokes their tokens', async () => {
        setupAuthMock(Role.ADMIN, ADMIN_1);
        const txMock = {
          profile: {
            findUnique: vi.fn().mockResolvedValue({
              id: ADMIN_2,
              email: 'admin2@restaurant.com',
              role: Role.ADMIN,
              status: ProfileStatus.ACTIVE,
            }),
            update: vi.fn().mockResolvedValue({
              id: ADMIN_2,
              email: 'admin2@restaurant.com',
              role: Role.ADMIN,
              status: ProfileStatus.SUSPENDED,
            }),
          },
          $queryRaw: vi.fn().mockResolvedValue([{ id: ADMIN_1 }, { id: ADMIN_2 }]),
        };
        vi.spyOn(prisma, '$transaction').mockImplementation(((
          fn: (tx: typeof txMock) => Promise<unknown>,
        ) => fn(txMock)) as never);

        const res = await request(app)
          .patch(`/api/users/${ADMIN_2}/status`)
          .set('Authorization', 'Bearer test-token')
          .send({ status: ProfileStatus.SUSPENDED });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.data.user.status).toBe(ProfileStatus.SUSPENDED);
        expect(isTokenRevoked(ADMIN_2, Math.floor(Date.now() / 1000) - 10)).toBe(true);
      });

      it('blocks demoting the last active ADMIN with LAST_ADMIN inside a transaction', async () => {
        setupAuthMock(Role.ADMIN, ADMIN_1);
        const txMock = {
          profile: {
            findUnique: vi.fn().mockResolvedValue({
              id: ADMIN_2,
              email: 'admin2@restaurant.com',
              role: Role.ADMIN,
              status: ProfileStatus.ACTIVE,
            }),
            update: vi.fn(),
          },
          $queryRaw: vi.fn().mockResolvedValue([{ id: ADMIN_2 }]),
        };
        vi.spyOn(prisma, '$transaction').mockImplementation(((
          fn: (tx: typeof txMock) => Promise<unknown>,
        ) => fn(txMock)) as never);

        const res = await request(app)
          .patch(`/api/users/${ADMIN_2}/role`)
          .set('Authorization', 'Bearer test-token')
          .send({ role: Role.STAFF });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(false);
        expect(res.body.error).toMatchObject({ code: 'LAST_ADMIN' });
        expect(txMock.profile.update).not.toHaveBeenCalled();
      });

      it('strips createdBy and omits permissions on GET /api/dishes for PENDING STAFF accounts', async () => {
        setupAuthMock(Role.STAFF, STAFF_A, ProfileStatus.PENDING);
        vi.spyOn(prisma.dish, 'count').mockResolvedValue(1);
        vi.spyOn(prisma.dish, 'findMany').mockResolvedValue([
          {
            id: ROW_ID,
            name: 'Pho Bo',
            slug: 'pho-bo',
            description: null,
            imageUrl: null,
            price: 50000,
            category: 'main',
            isAvailable: true,
            isFeatured: false,
            prepTimeMinutes: 10,
            chefId: null,
            createdBy: STAFF_A,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            chef: { id: 'c1', name: 'Chef', createdBy: STAFF_A },
          } as never,
        ]);

        const res = await request(app)
          .get('/api/dishes')
          .set('Authorization', 'Bearer test-token');

        expect(res.status).toBe(200);
        const dish = res.body.data.dishes[0];
        expect(dish.createdBy).toBeUndefined();
        expect(dish.permissions).toBeUndefined();
        expect(dish.chef.createdBy).toBeUndefined();
      });
    });
  });
});
