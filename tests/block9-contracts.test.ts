import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { recordPasswordReset, clearRevocationState } from '../src/auth/token-revocation.js';
import { clearLoginAttempts } from '../src/auth/login-attempts.js';

describe('Block 9 Deck Contracts (Bài 1)', () => {
  const app = createApp();

  beforeEach(() => {
    clearRevocationState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TC01 & TC02: Unauthenticated access without Bearer or CSRF tokens', () => {
    it('returns 401 UNAUTHENTICATED on mutating POST without Bearer token (not 403 CSRF_INVALID)', async () => {
      const res = await request(app)
        .post('/api/dishes')
        .send({ name: 'Món ăn không có auth' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Vui lòng đăng nhập để tiếp tục.',
        },
      });
    });

    it('returns 401 UNAUTHENTICATED on direct cURL to protected GET endpoints', async () => {
      const res = await request(app).get('/api/chefs');
      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('TC03: Expired JWT vs Tampered JWT', () => {
    it('returns 401 TOKEN_EXPIRED when JWT exp claim is in the past', async () => {
      // Construct a token with expired payload
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'user-expired-uuid',
          email: 'test@example.com',
          exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
        }),
      ).toString('base64url');
      const expiredJwt = `${header}.${payload}.dummySignature`;

      const res = await request(app)
        .post('/api/dishes')
        .set('Authorization', `Bearer ${expiredJwt}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'TOKEN_EXPIRED',
        },
      });
    });

    it('returns 401 UNAUTHENTICATED when token is tampered/invalid signature', async () => {
      vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
        auth: {
          getClaims: vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid signature' } }),
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid signature' } }),
        },
      } as any);

      const tamperedJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.badSig';
      const res = await request(app)
        .post('/api/dishes')
        .set('Authorization', `Bearer ${tamperedJwt}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
        },
      });
    });
  });

  describe('TC08: Register missing or invalid CAPTCHA', () => {
    it('returns HTTP 200 with CAPTCHA_REQUIRED when captcha response is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'no_captcha@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'CAPTCHA_REQUIRED',
        },
      });
    });
  });

  describe('TC09: Verify OTP with invalid/expired code', () => {
    it('returns HTTP 200 with INVALID_OTP', async () => {
      vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
        auth: {
          verifyOtp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: new Error('Token has expired or is invalid'),
          }),
        },
      } as any);

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          email: 'pending@example.com',
          token: '000000',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'INVALID_OTP',
        },
      });
    });
  });

  describe('TC10: Login with pending/unactivated account', () => {
    it('returns HTTP 200 with ACCOUNT_NOT_ACTIVATED and no accessToken', async () => {
      vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
          }),
        },
      } as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'pending_user@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'ACCOUNT_NOT_ACTIVATED',
        },
      });
      expect(res.body.data).toBeUndefined();
    });

    it('returns HTTP 200 with INVALID_CREDENTIALS on wrong password', async () => {
      vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
          }),
        },
      } as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
        },
      });
    });
  });

  describe('TC15: Reset password with invalid, expired, or used token', () => {
    it('returns HTTP 200 with INVALID_RESET_TOKEN', async () => {
      vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Invalid token') }),
          verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Token expired') }),
          exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Code expired') }),
        },
      } as any);

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'expired-or-used-token',
          password: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'INVALID_RESET_TOKEN',
        },
      });
    });
  });

  describe('TC16: Token revocation after password reset', () => {
    it('revokes previous JWTs when user resets password and returns 401 UNAUTHENTICATED on older tokens', async () => {
      const userId = 'user-reset-test-id';
      const nowSec = Math.floor(Date.now() / 1000);

      // Token issued 60 seconds ago
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: userId,
          email: 'user@example.com',
          iat: nowSec - 60,
          exp: nowSec + 3600,
        }),
      ).toString('base64url');
      const oldJwt = `${header}.${payload}.mockSig`;

      // Mock user validation before reset
      vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: { sub: userId, iat: nowSec - 60, exp: nowSec + 3600 } },
            error: null,
          }),
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: userId, email: 'user@example.com' } },
            error: null,
          }),
        },
      } as any);

      vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        role: 'VIEWER',
      } as any);

      // Step 1: User resets password at nowSec
      recordPasswordReset(userId);

      // Step 2: Attempting to call protected API with old token (issued at nowSec - 60)
      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', `Bearer ${oldJwt}`);

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
        },
      });
    });
  });
});
