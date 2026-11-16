import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { createMfaChallenge, resetMfaChallenges } from '../src/auth/mfa-challenges.js';
import { hashMfaCode, hashRecoveryCode } from '../src/auth/mfa.js';
import { clearRevocationState } from '../src/auth/token-revocation.js';
import { Role } from '../src/generated/prisma/enums.js';

const app = createApp();

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const targetId = '11111111-1111-4111-8111-111111111111';

const baseProfile = {
  id: userId,
  email: 'user@example.com',
  displayName: 'Test User',
  role: Role.VIEWER,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  searchVector: null,
};

function makeClient() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: null, error: null }),
      getUser: vi.fn(),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'cookie-token' } },
        error: null,
      }),
      setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      mfa: {
        listFactors: vi.fn(),
        enroll: vi.fn(),
        challengeAndVerify: vi.fn(),
        unenroll: vi.fn(),
        getAuthenticatorAssuranceLevel: vi.fn(),
        recoveryCodes: {
          generate: vi.fn(),
          verify: vi.fn(),
          regenerate: vi.fn(),
          getStatus: vi.fn(),
          unenroll: vi.fn(),
        },
      },
    },
  };
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    factorId: 'factor-1',
    enabledAt: new Date('2026-01-02T00:00:00Z'),
    recoveryCodesEnabled: true,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function makeChallenge(overrides: Record<string, unknown> = {}) {
  return createMfaChallenge({
    userId,
    factorId: 'factor-1',
    accessToken: 'aal1-token',
    refreshToken: 'aal1-refresh',
    email: 'user@example.com',
    redirectTo: '/profile',
    ...overrides,
  });
}

function claims(aal: 'aal1' | 'aal2', sub = userId) {
  return {
    data: {
      claims: {
        sub,
        email: 'user@example.com',
        aal,
        iat: Math.floor(Date.now() / 1000),
      },
    },
    error: null,
  };
}

beforeEach(() => {
  resetMfaChallenges();
  clearRevocationState();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetMfaChallenges();
  clearRevocationState();
});

describe('Supabase MFA login flow', () => {
  it('returns mfaRequired and no token/cookie when the user has a verified TOTP factor', async () => {
    const stateless = makeClient();
    stateless.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: userId, email: baseProfile.email },
        session: { access_token: 'aal1-token', refresh_token: 'aal1-refresh', expires_in: 3600 },
      },
      error: null,
    });
    stateless.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: userId,
          email: baseProfile.email,
          factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
        },
      },
      error: null,
    });
    vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue(stateless as never);
    const requestClient = makeClient();
    const requestClientSpy = vi
      .spyOn(supabaseLib, 'createSupabaseForRequest')
      .mockReturnValue(requestClient as never);

    vi.spyOn(prisma.profile, 'upsert').mockResolvedValue(baseProfile as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.mfaState, 'create').mockResolvedValue(makeState() as never);

    const res = await request(app).post('/api/auth/login').send({
      email: baseProfile.email,
      password: 'Secret123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBe(true);
    expect(res.body.data.challengeId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body.data.token).toBeUndefined();
    expect(res.body.data.accessToken).toBeUndefined();
    expect(requestClientSpy).not.toHaveBeenCalled();
  });

  it('sets the session cookies and returns a token when the user has no MFA factor', async () => {
    const stateless = makeClient();
    stateless.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: userId, email: baseProfile.email },
        session: { access_token: 'aal1-token', refresh_token: 'aal1-refresh', expires_in: 3600 },
      },
      error: null,
    });
    stateless.auth.getUser.mockResolvedValue({
      data: { user: { id: userId, email: baseProfile.email, factors: [] } },
      error: null,
    });
    vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue(stateless as never);

    const requestClient = makeClient();
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);
    vi.spyOn(prisma.profile, 'upsert').mockResolvedValue(baseProfile as never);
    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue(baseProfile as never);
    vi.spyOn(prisma.mfaState, 'deleteMany').mockResolvedValue({ count: 0 });

    const res = await request(app).post('/api/auth/login').send({
      email: baseProfile.email,
      password: 'Secret123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe('aal1-token');
    expect(res.body.data.user.mfaEnabled).toBe(false);
    expect(requestClient.auth.setSession).toHaveBeenCalledWith({
      access_token: 'aal1-token',
      refresh_token: 'aal1-refresh',
    });
  });
});

describe('Supabase MFA challenge verification', () => {
  it('returns an AAL2 session after a valid TOTP code', async () => {
    const challenge = makeChallenge();
    const stateless = makeClient();
    stateless.auth.mfa.challengeAndVerify.mockResolvedValue({
      data: { access_token: 'aal2-token', refresh_token: 'aal2-refresh', expires_in: 3600 },
      error: null,
    });
    vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue(stateless as never);

    const requestClient = makeClient();
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(makeState() as never);
    vi.spyOn(prisma.mfaState, 'updateMany').mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue(baseProfile as never);

    const res = await request(app).post('/api/auth/mfa/verify').send({
      challengeId: challenge.id,
      code: '123456',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe('aal2-token');
    expect(res.body.data.user.mfaEnabled).toBe(true);
    expect(stateless.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    });
    expect(requestClient.auth.setSession).toHaveBeenCalledWith({
      access_token: 'aal2-token',
      refresh_token: 'aal2-refresh',
    });
  });

  it('rejects a TOTP code that was already accepted (RFC 6238 §5.2)', async () => {
    const challenge = makeChallenge();
    const stateless = makeClient();
    vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue(stateless as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(
      makeState({
        lastCodeHash: hashMfaCode('123456'),
        lastCodeAt: new Date(),
      }) as never,
    );

    const res = await request(app).post('/api/auth/mfa/verify').send({
      challengeId: challenge.id,
      code: '123456',
    });

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe('INVALID_MFA_CODE');
    expect(stateless.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('consumes an app recovery code and disables MFA for the held session', async () => {
    const challenge = makeChallenge();
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(makeState() as never);
    vi.spyOn(prisma.mfaRecoveryCode, 'findFirst').mockResolvedValue({
      id: 'recovery-1',
      userId,
      codeHash: hashRecoveryCode('ABCDEFGHIJ'),
      usedAt: null,
    } as never);
    vi.spyOn(prisma.mfaRecoveryCode, 'updateMany').mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.mfaRecoveryCode, 'deleteMany').mockResolvedValue({ count: 9 });
    vi.spyOn(prisma.mfaState, 'deleteMany').mockResolvedValue({ count: 1 });

    const listFactors = vi
      .spyOn(supabaseLib.supabaseAdmin.auth.admin.mfa, 'listFactors')
      .mockResolvedValue({
        data: { factors: [{ id: 'factor-1' }] },
        error: null,
      } as never);
    const deleteFactor = vi
      .spyOn(supabaseLib.supabaseAdmin.auth.admin.mfa, 'deleteFactor')
      .mockResolvedValue({ data: {}, error: null } as never);

    const res = await request(app).post('/api/auth/mfa/verify-recovery').send({
      challengeId: challenge.id,
      code: 'ABCD-EFGH-IJ',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.recoveryUsed).toBe(true);
    expect(res.body.data.reauthRequired).toBe(true);
    expect(res.body.data.token).toBeUndefined();
    expect(listFactors).toHaveBeenCalledWith({ userId });
    expect(deleteFactor).toHaveBeenCalledWith({ userId, id: 'factor-1' });
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(prisma.mfaState.deleteMany).toHaveBeenCalledWith({ where: { userId } });
  });

  it('returns INVALID_MFA_CODE with remaining attempts and does not set cookies', async () => {
    const challenge = makeChallenge();
    const stateless = makeClient();
    stateless.auth.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: { code: 'mfa_verification_failed', message: 'Invalid code' },
    });
    vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue(stateless as never);

    const requestClient = makeClient();
    const requestClientSpy = vi
      .spyOn(supabaseLib, 'createSupabaseForRequest')
      .mockReturnValue(requestClient as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(
      makeState({ failedAttempts: 0 }) as never,
    );
    vi.spyOn(prisma.mfaState, 'upsert').mockResolvedValue(
      makeState({ failedAttempts: 1 }) as never,
    );

    const res = await request(app).post('/api/auth/mfa/verify').send({
      challengeId: challenge.id,
      code: '000000',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_MFA_CODE');
    expect(res.body.error.fields.attempts).toBe('4');
    expect(requestClientSpy).not.toHaveBeenCalled();
  });

  it('returns MFA_LOCKED without verifying when the account is locked', async () => {
    const challenge = makeChallenge();
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(
      makeState({ lockedUntil: new Date(Date.now() + 10 * 60_000) }) as never,
    );

    const res = await request(app).post('/api/auth/mfa/verify').send({
      challengeId: challenge.id,
      code: '123456',
    });

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe('MFA_LOCKED');
    expect(res.body.error.fields.retryAfterMinutes).toBeTruthy();
  });

  it('rejects an unknown or expired challenge', async () => {
    const res = await request(app).post('/api/auth/mfa/verify').send({
      challengeId: 'missing',
      code: '123456',
    });

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe('MFA_CHALLENGE_EXPIRED');
  });
});

describe('Supabase MFA enrollment', () => {
  it('enables MFA, returns recovery codes once, and globally signs out', async () => {
    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal1'));
    requestClient.auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);

    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      ...baseProfile,
      mfaState: null,
    } as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.mfaState, 'create').mockResolvedValue(makeState() as never);
    vi.spyOn(prisma.mfaState, 'update').mockResolvedValue(
      makeState({ recoveryCodesEnabled: true }) as never,
    );
    vi.spyOn(prisma.mfaRecoveryCode, 'deleteMany').mockResolvedValue({ count: 0 });
    vi.spyOn(prisma.mfaRecoveryCode, 'createMany').mockResolvedValue({ count: 10 });

    const res = await request(app)
      .post('/api/auth/mfa/enroll/verify')
      .set('Authorization', 'Bearer aal1-token')
      .send({ factorId: 'factor-1', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      enabled: true,
      factorId: 'factor-1',
      recoveryCodesEnabled: true,
      reauthRequired: true,
    });
    expect(res.body.data.recoveryCodes).toHaveLength(10);
    expect(requestClient.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    });
    expect(requestClient.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('rejects enrollment when MFA is already enabled', async () => {
    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal2'));
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);
    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      ...baseProfile,
      mfaState: { enabledAt: new Date() },
    } as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(makeState() as never);

    const res = await request(app)
      .post('/api/auth/mfa/enroll/verify')
      .set('Authorization', 'Bearer aal2-token')
      .send({ factorId: 'factor-1', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe('MFA_ALREADY_ENABLED');
  });
});

describe('Supabase MFA disable', () => {
  it('rejects a wrong password', async () => {
    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal2'));
    requestClient.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);

    const stateless = makeClient();
    stateless.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'Invalid credentials' },
    });
    vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue(stateless as never);

    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      ...baseProfile,
      mfaState: { enabledAt: new Date() },
    } as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(makeState() as never);

    const res = await request(app)
      .post('/api/auth/mfa/disable')
      .set('Authorization', 'Bearer aal2-token')
      .send({ password: 'wrong-password', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
  });

  it('unenrolls the factor, clears state, and globally signs out', async () => {
    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal2'));
    requestClient.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    requestClient.auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);

    const stateless = makeClient();
    stateless.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: userId }, session: { access_token: 'pw-token', refresh_token: 'pw' } },
      error: null,
    });
    vi.spyOn(supabaseLib, 'createStatelessClient').mockReturnValue(stateless as never);

    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      ...baseProfile,
      mfaState: { enabledAt: new Date() },
    } as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(makeState() as never);
    vi.spyOn(prisma.mfaRecoveryCode, 'deleteMany').mockResolvedValue({ count: 10 });
    vi.spyOn(prisma.mfaState, 'deleteMany').mockResolvedValue({ count: 1 });

    const listFactors = vi
      .spyOn(supabaseLib.supabaseAdmin.auth.admin.mfa, 'listFactors')
      .mockResolvedValue({
        data: { factors: [{ id: 'factor-1' }] },
        error: null,
      } as never);
    const deleteFactor = vi
      .spyOn(supabaseLib.supabaseAdmin.auth.admin.mfa, 'deleteFactor')
      .mockResolvedValue({ data: {}, error: null } as never);

    const res = await request(app)
      .post('/api/auth/mfa/disable')
      .set('Authorization', 'Bearer aal2-token')
      .send({ password: 'correct-password', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data.reauthRequired).toBe(true);
    expect(listFactors).toHaveBeenCalledWith({ userId });
    expect(deleteFactor).toHaveBeenCalledWith({ userId, id: 'factor-1' });
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(requestClient.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });
});

describe('Supabase MFA status and AAL enforcement', () => {
  it('returns MFA status with remaining recovery codes', async () => {
    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal2'));
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);
    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      ...baseProfile,
      mfaState: { enabledAt: new Date() },
    } as never);
    vi.spyOn(prisma.mfaState, 'findUnique').mockResolvedValue(makeState() as never);
    vi.spyOn(prisma.mfaRecoveryCode, 'count').mockResolvedValue(7);

    const res = await request(app)
      .get('/api/auth/mfa/status')
      .set('Authorization', 'Bearer aal2-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      enabled: true,
      factorId: 'factor-1',
      recoveryCodesEnabled: true,
      recoveryCodesRemaining: 7,
    });
  });

  it('rejects AAL1 tokens for MFA-enabled users', async () => {
    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal1'));
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);
    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      ...baseProfile,
      mfaState: { enabledAt: new Date() },
    } as never);

    const res = await request(app).get('/api/stats').set('Authorization', 'Bearer aal1-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });

  it('includes mfaEnabled in /api/auth/me', async () => {
    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal2'));
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);
    vi.spyOn(prisma.profile, 'findUnique').mockResolvedValue({
      ...baseProfile,
      mfaState: { enabledAt: new Date() },
    } as never);

    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer aal2-token');

    expect(res.status).toBe(200);
    expect(res.body.data.user.mfaEnabled).toBe(true);
    expect(res.body.data.mfaRequired).toBe(false);
  });
});

describe('Admin MFA reset', () => {
  it('removes factors and the local mirror for the target user', async () => {
    const adminProfile = {
      ...baseProfile,
      id: userId,
      email: 'admin@example.com',
      role: Role.ADMIN,
      mfaState: null,
    };
    const targetProfile = {
      ...baseProfile,
      id: targetId,
      email: 'target@example.com',
      mfaState: null,
    };

    const requestClient = makeClient();
    requestClient.auth.getClaims.mockResolvedValue(claims('aal2'));
    vi.spyOn(supabaseLib, 'createSupabaseForRequest').mockReturnValue(requestClient as never);

    vi.spyOn(prisma.profile, 'findUnique')
      .mockResolvedValueOnce(adminProfile as never)
      .mockResolvedValueOnce(targetProfile as never);
    vi.spyOn(prisma.mfaRecoveryCode, 'deleteMany').mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.mfaState, 'deleteMany').mockResolvedValue({ count: 1 });

    const listFactors = vi
      .spyOn(supabaseLib.supabaseAdmin.auth.admin.mfa, 'listFactors')
      .mockResolvedValue({
        data: { factors: [{ id: 'factor-1' }] },
        error: null,
      } as never);
    const deleteFactor = vi
      .spyOn(supabaseLib.supabaseAdmin.auth.admin.mfa, 'deleteFactor')
      .mockResolvedValue({ data: {}, error: null } as never);

    const res = await request(app)
      .post(`/api/users/${targetId}/mfa/reset`)
      .set('Authorization', 'Bearer aal2-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('target@example.com');
    expect(listFactors).toHaveBeenCalledWith({ userId: targetId });
    expect(deleteFactor).toHaveBeenCalledWith({ userId: targetId, id: 'factor-1' });
    expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId: targetId } });
    expect(prisma.mfaState.deleteMany).toHaveBeenCalledWith({ where: { userId: targetId } });
  });
});
