import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const {
  profileFindUnique,
  profileUpdate,
  challengeFindUnique,
  challengeUpdate,
  challengeUpdateMany,
  challengeCreate,
  sendActivationOtpEmail,
  revokeSession,
  clearSessionCookie,
} = vi.hoisted(() => ({
  profileFindUnique: vi.fn(),
  profileUpdate: vi.fn(),
  challengeFindUnique: vi.fn(),
  challengeUpdate: vi.fn(),
  challengeUpdateMany: vi.fn(),
  challengeCreate: vi.fn(),
  sendActivationOtpEmail: vi.fn(),
  revokeSession: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

vi.mock('../src/middleware/security.js', () => ({
  browserId: (_req: unknown, _res: unknown, next: () => void) => next(),
  flash: (req: { flash?: unknown }, res: { locals: Record<string, unknown> }, next: () => void) => {
    req.flash = vi.fn();
    res.locals.flash = [];
    next();
  },
  multipart: (_req: unknown, _res: unknown, next: () => void) => next(),
  csrfProtection: (_req: unknown, _res: unknown, next: () => void) => next(),
  csrfToken: (_req: unknown, res: { locals: Record<string, unknown> }, next: () => void) => {
    res.locals.csrfToken = 'test-csrf';
    next();
  },
}));

vi.mock('../src/auth/middleware.js', () => ({
  loadUser: (
    req: { user: unknown },
    res: { locals: Record<string, unknown> },
    next: () => void,
  ) => {
    req.user = null;
    res.locals.user = null;
    next();
  },
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../src/auth/password.js', () => ({
  DUMMY_PASSWORD_HASH: 'dummy',
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('../src/auth/session.js', () => ({
  SESSION_COOKIE: 'sid',
  createSession: vi.fn(),
  revokeSession,
  revokeAllSessions: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie,
}));

vi.mock('../src/lib/mailer.js', () => ({
  sendActivationOtpEmail,
  sendPasswordResetEmail: vi.fn(),
  sendPasswordChangedEmail: vi.fn(async () => undefined),
  MailerNotConfiguredError: class MailerNotConfiguredError extends Error {},
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    profile: { findUnique: profileFindUnique, update: profileUpdate },
    activationChallenge: {
      findUnique: challengeFindUnique,
      update: challengeUpdate,
      updateMany: challengeUpdateMany,
      create: challengeCreate,
    },
    passwordReset: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/captcha.js', () => ({
  verifyCaptcha: vi.fn(),
  captchaErrorMessage: () => 'captcha error',
}));

import { createApp } from '../src/app.js';
import { hashOtp } from '../src/auth/activation.js';

const EMAIL = 'a@b.com';
const PENDING_USER = {
  id: 'user-1',
  email: EMAIL,
  emailNormalized: EMAIL,
  displayName: null,
  passwordHash: 'hash',
  role: 'VIEWER',
  status: 'PENDING',
};

function challenge(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    purpose: 'activation',
    attempts: 0,
    otpHash: hashOtp('user-1', '123456'),
    expiresAt: new Date(now + 60_000),
    lockedUntil: null,
    lastSentAt: new Date(now - 120_000),
    sendCount: 1,
    sendWindowStart: new Date(now - 120_000),
    usedAt: null,
    ...overrides,
  };
}

describe('activation OTP and logout', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    profileFindUnique.mockResolvedValue(PENDING_USER);
    profileUpdate.mockResolvedValue({});
    challengeFindUnique.mockResolvedValue(challenge());
    challengeUpdate.mockResolvedValue({});
    challengeUpdateMany.mockResolvedValue({ count: 1 });
    challengeCreate.mockResolvedValue({});
    sendActivationOtpEmail.mockResolvedValue(undefined);
    revokeSession.mockResolvedValue(undefined);
    app = createApp();
  });

  function postActivate(otp: string, email = EMAIL) {
    return request(app).post('/activate').type('form').send({ email, otp });
  }

  it('activates an account without creating a session', async () => {
    const res = await postActivate('123456');

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/login');
    expect(challengeUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        purpose: 'activation',
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { status: 'ACTIVE', emailVerifiedAt: expect.any(Date) },
    });
  });

  it('rejects a challenge whose purpose is not activation', async () => {
    challengeFindUnique.mockResolvedValue(challenge({ purpose: 'password-reset' }));

    const res = await postActivate('123456');

    expect(res.status).toBe(422);
    expect(challengeUpdate).not.toHaveBeenCalled();
    expect(challengeUpdateMany).not.toHaveBeenCalled();
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('increments attempts for a wrong OTP and stays pending', async () => {
    const res = await postActivate('000000');

    expect(res.status).toBe(422);
    expect(res.text).toContain('Mã OTP không đúng');
    expect(challengeUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { attempts: 1, lockedUntil: null },
    });
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('locks the challenge after the configured number of wrong OTPs', async () => {
    challengeFindUnique.mockResolvedValue(challenge({ attempts: 4 }));

    const res = await postActivate('000000');

    expect(res.status).toBe(429);
    expect(challengeUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { attempts: 5, lockedUntil: expect.any(Date) },
    });
  });

  it('rejects a locked challenge without checking the OTP', async () => {
    challengeFindUnique.mockResolvedValue(
      challenge({ lockedUntil: new Date(Date.now() + 60_000) }),
    );

    const res = await postActivate('123456');

    expect(res.status).toBe(429);
    expect(challengeUpdate).not.toHaveBeenCalled();
  });

  it('rejects an expired OTP', async () => {
    challengeFindUnique.mockResolvedValue(
      challenge({ expiresAt: new Date(Date.now() - 1_000) }),
    );

    const res = await postActivate('123456');

    expect(res.status).toBe(422);
    expect(challengeUpdate).not.toHaveBeenCalled();
  });

  it('does not reveal activation state for an already-active account', async () => {
    profileFindUnique.mockResolvedValue({ ...PENDING_USER, status: 'ACTIVE' });

    const res = await postActivate('123456');

    expect(res.status).toBe(422);
    expect(challengeFindUnique).not.toHaveBeenCalled();
  });

  it('rate-limits resend while the cooldown is active', async () => {
    challengeFindUnique.mockResolvedValue(
      challenge({ lastSentAt: new Date(), sendCount: 1 }),
    );

    const res = await request(app)
      .post('/activate/resend')
      .type('form')
      .send({ email: EMAIL });

    expect(res.status).toBe(429);
    expect(sendActivationOtpEmail).not.toHaveBeenCalled();
  });

  it('rotates the OTP on resend without resetting attempts', async () => {
    challengeFindUnique.mockResolvedValue(challenge({ attempts: 2, sendCount: 2 }));

    const res = await request(app)
      .post('/activate/resend')
      .type('form')
      .send({ email: EMAIL });

    expect(res.status).toBe(200);
    expect(challengeUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: expect.objectContaining({
        otpHash: expect.any(String),
        sendCount: 3,
        expiresAt: expect.any(Date),
        lastSentAt: expect.any(Date),
        usedAt: null,
      }),
    });
    expect(challengeUpdate.mock.calls[0]?.[0]?.data).not.toHaveProperty('attempts');
    const otp = sendActivationOtpEmail.mock.calls[0]?.[1] as string;
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('rejects the previous OTP after a resend rotated the hash', async () => {
    // Simulate the stored hash after a resend: only the new OTP verifies.
    challengeFindUnique.mockResolvedValue(
      challenge({ otpHash: hashOtp('user-1', '654321'), sendCount: 2 }),
    );

    const oldOtp = await postActivate('123456');
    expect(oldOtp.status).toBe(422);
    expect(profileUpdate).not.toHaveBeenCalled();

    const newOtp = await postActivate('654321');
    expect(newOtp.status).toBe(303);
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { status: 'ACTIVE', emailVerifiedAt: expect.any(Date) },
    });
  });

  it('returns the same generic response for an unknown resend email', async () => {
    profileFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/activate/resend')
      .type('form')
      .send({ email: 'missing@b.com' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Kiểm tra email');
    expect(sendActivationOtpEmail).not.toHaveBeenCalled();
  });

  it('revokes the server-side session on logout and clears the cookie', async () => {
    const res = await request(app).post('/logout').set('Cookie', ['sid=old-sid']);

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/');
    expect(revokeSession).toHaveBeenCalledWith('old-sid');
    expect(clearSessionCookie).toHaveBeenCalledOnce();
  });
});
