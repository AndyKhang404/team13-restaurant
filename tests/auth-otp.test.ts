import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import * as supabaseLib from '../src/lib/supabase.js';

describe('Signup OTP Verification Endpoints (/api/auth/verify-otp & /api/auth/resend-otp)', () => {
  const app = createApp();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies a valid signup OTP, upserts the profile, signs out session, and returns verified: true', async () => {
    const verifyOtpMock = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: 'user-new-uuid',
          email: 'newuser@example.com',
          user_metadata: { display_name: 'New Customer' },
        },
        session: { access_token: 'temp-session-token' },
      },
      error: null,
    });
    const signOutMock = vi.fn().mockResolvedValue({ error: null });

    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
      auth: {
        verifyOtp: verifyOtpMock,
        signOut: signOutMock,
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getClaims: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    } as any);

    const upsertSpy = vi.spyOn(prisma.profile, 'upsert').mockResolvedValue({
      id: 'user-new-uuid',
      email: 'newuser@example.com',
      displayName: 'New Customer',
    } as any);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .set('Authorization', 'Bearer bypass-csrf')
      .send({
        email: 'newuser@example.com',
        token: ' 123 456 \n', // Pasted whitespace is stripped automatically
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        verified: true,
        email: 'newuser@example.com',
      },
    });
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      token: '123456',
      type: 'signup',
    });
    expect(upsertSpy).toHaveBeenCalledOnce();
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it('rejects an invalid or expired OTP with 400 INVALID_OTP', async () => {
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: new Error('Token has expired or is invalid'),
        }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getClaims: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    } as any);

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .set('Authorization', 'Bearer bypass-csrf')
      .send({
        email: 'wrong@example.com',
        token: '000000',
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_OTP',
      },
    });
  });

  it('resends a signup OTP via supabase.auth.resend', async () => {
    const resendMock = vi.fn().mockResolvedValue({ data: {}, error: null });

    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue({
      auth: {
        resend: resendMock,
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getClaims: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    } as any);

    const res = await request(app)
      .post('/api/auth/resend-otp')
      .set('Authorization', 'Bearer bypass-csrf')
      .send({
        email: 'resend@example.com',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        email: 'resend@example.com',
      },
    });
    expect(resendMock).toHaveBeenCalledWith({
      type: 'signup',
      email: 'resend@example.com',
    });
  });
});
