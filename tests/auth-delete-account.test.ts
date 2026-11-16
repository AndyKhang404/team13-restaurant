import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../src/generated/prisma/client.js';

const {
  mockDeleteUser,
  mockSignOut,
  mockProfileCount,
  mockProfileDeleteMany,
  mockRecordPasswordReset,
} = vi.hoisted(() => ({
  mockDeleteUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockProfileCount: vi.fn(),
  mockProfileDeleteMany: vi.fn(),
  mockRecordPasswordReset: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({
  isProd: false,
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    APP_URL: 'http://localhost:3000',
    EMAIL_REDIRECT_ORIGIN: 'http://localhost:5173',
    CORS_ORIGIN: '',
    DATABASE_URL: 'postgresql://localhost:5432/test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'pub-key',
    SUPABASE_SECRET_KEY: 'secret-key',
    STORAGE_BUCKET: 'images',
    CSRF_SECRET: '0123456789abcdef0123456789abcdef',
    CAPTCHA_SITE_KEY: 'site-key',
    CAPTCHA_SECRET_KEY: 'secret-key',
  },
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    profile: {
      count: mockProfileCount,
      deleteMany: mockProfileDeleteMany,
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/supabase.js', () => ({
  getBearerToken: () => null,
  hasAuthCookie: () => false,
  createSupabaseForRequest: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: mockDeleteUser,
      },
    },
  },
}));

vi.mock('../src/middleware/security.js', () => ({
  generateCsrfToken: () => 'test-csrf-token',
}));

vi.mock('../src/auth/token-revocation.js', () => ({
  recordPasswordReset: mockRecordPasswordReset,
  isTokenRevoked: () => false,
  clearRevocationState: vi.fn(),
}));

import authRouter from '../src/auth/routes.js';

function makeUser(overrides: Partial<Profile> = {}): Profile {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'viewer@example.com',
    displayName: 'Viewer User',
    role: 'VIEWER',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildTestApp(currentUser: Profile | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser;
    req.tokenExpired = false;
    req.tokenRevoked = false;
    next();
  });
  app.use('/api/auth', authRouter);
  return app;
}

describe('DELETE /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockProfileDeleteMany.mockResolvedValue({ count: 1 });
    mockProfileCount.mockResolvedValue(0);
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp(null);

    const res = await request(app).delete('/api/auth/me').send({ email: 'viewer@example.com' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockProfileDeleteMany).not.toHaveBeenCalled();
  });

  it('returns EMAIL_MISMATCH when confirmation email does not match', async () => {
    const app = buildTestApp(makeUser({ email: 'viewer@example.com' }));

    const res = await request(app).delete('/api/auth/me').send({ email: 'other@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'EMAIL_MISMATCH' },
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockProfileDeleteMany).not.toHaveBeenCalled();
  });

  it('blocks deletion with LAST_ADMIN when user is the only ADMIN', async () => {
    const admin = makeUser({ id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' });
    const app = buildTestApp(admin);
    mockProfileCount.mockResolvedValue(0);

    const res = await request(app).delete('/api/auth/me').send({ email: 'admin@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'LAST_ADMIN' },
    });
    expect(mockProfileCount).toHaveBeenCalledWith({
      where: { role: 'ADMIN', id: { not: 'admin-1' } },
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockProfileDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes auth user, profile, revokes token, and signs out on success', async () => {
    const user = makeUser({ email: 'Viewer@Example.com' });
    const app = buildTestApp(user);

    const res = await request(app).delete('/api/auth/me').send({ email: 'viewer@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      data: { message: 'Tài khoản đã được xóa.' },
    });
    expect(mockDeleteUser).toHaveBeenCalledWith(user.id);
    expect(mockProfileDeleteMany).toHaveBeenCalledWith({ where: { id: user.id } });
    expect(mockRecordPasswordReset).toHaveBeenCalledWith(user.id);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('allows an ADMIN to self-delete when another ADMIN exists', async () => {
    const admin = makeUser({ id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' });
    const app = buildTestApp(admin);
    mockProfileCount.mockResolvedValue(1);

    const res = await request(app).delete('/api/auth/me').send({ email: 'admin@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      data: { message: 'Tài khoản đã được xóa.' },
    });
    expect(mockDeleteUser).toHaveBeenCalledWith('admin-1');
    expect(mockProfileDeleteMany).toHaveBeenCalledWith({ where: { id: 'admin-1' } });
  });

  it('leaves Profile intact if Supabase deleteUser fails', async () => {
    const user = makeUser();
    const app = buildTestApp(user);
    mockDeleteUser.mockResolvedValue({ data: { user: null }, error: new Error('Supabase down') });

    const res = await request(app).delete('/api/auth/me').send({ email: user.email });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'AUTH_ERROR' },
    });
    expect(mockProfileDeleteMany).not.toHaveBeenCalled();
    expect(mockRecordPasswordReset).not.toHaveBeenCalled();
  });
});
