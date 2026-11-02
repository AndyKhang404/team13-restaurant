import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const state = vi.hoisted(() => ({
  currentUser: null as { id: string; email: string } | null,
}));

const {
  findUnique,
  updateMany,
  update,
  create,
  profileFindUnique,
  profileUpdate,
  hashPassword,
  revokeAllSessions,
  clearSessionCookie,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  profileFindUnique: vi.fn(),
  profileUpdate: vi.fn(),
  hashPassword: vi.fn(),
  revokeAllSessions: vi.fn(),
  clearSessionCookie: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPasswordChangedEmail: vi.fn(),
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
    req.user = state.currentUser;
    res.locals.user = state.currentUser;
    next();
  },
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../src/auth/password.js', () => ({
  DUMMY_PASSWORD_HASH: 'dummy',
  hashPassword,
  verifyPassword: vi.fn(),
}));

vi.mock('../src/auth/session.js', () => ({
  SESSION_COOKIE: 'sid',
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllSessions,
  setSessionCookie: vi.fn(),
  clearSessionCookie,
}));

vi.mock('../src/lib/mailer.js', () => ({
  sendActivationOtpEmail: vi.fn(),
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  MailerNotConfiguredError: class MailerNotConfiguredError extends Error {},
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    profile: { findUnique: profileFindUnique, update: profileUpdate },
    passwordReset: { findUnique, updateMany, update, create },
  },
}));

const verifyCaptcha = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/captcha.js', () => ({
  verifyCaptcha,
  captchaErrorMessage: (r: string) => `captcha:${r}`,
}));

import { createApp } from '../src/app.js';
import {
  FORGOT_MAX_REQUESTS,
  hashResetToken,
  resetForgotRateLimit,
} from '../src/auth/password-reset.js';

const validRow = {
  id: 'reset-1',
  userId: 'user-1',
  email: 'a@b.com',
  tokenHash: 'hash',
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
};

describe('forgot / reset password with local accounts', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetForgotRateLimit();
    state.currentUser = null;

    profileFindUnique.mockResolvedValue(null);
    profileUpdate.mockResolvedValue({});
    findUnique.mockResolvedValue(null);
    updateMany.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({});
    create.mockResolvedValue({});
    hashPassword.mockResolvedValue('new-hash');
    revokeAllSessions.mockResolvedValue(undefined);
    sendPasswordResetEmail.mockResolvedValue(undefined);
    sendPasswordChangedEmail.mockResolvedValue(undefined);
    verifyCaptcha.mockResolvedValue({ ok: true });

    app = createApp();
  });

  function postForgot(email: string, captcha = 'valid-token') {
    return request(app)
      .post('/forgot')
      .type('form')
      .send({ email, 'g-recaptcha-response': captcha });
  }

  function postReset(body: Record<string, string>) {
    return request(app).post('/reset').type('form').send(body);
  }

  it('returns the same response for existing and non-existing emails', async () => {
    profileFindUnique.mockResolvedValueOnce({ id: 'user-1', email: 'a@b.com' });
    const existing = await postForgot('a@b.com');

    profileFindUnique.mockResolvedValueOnce(null);
    const missing = await postForgot('missing@b.com');

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.text).toBe(missing.text);
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it('returns 429 after too many requests for the same email', async () => {
    for (let i = 0; i < FORGOT_MAX_REQUESTS; i += 1) {
      const res = await postForgot('a@b.com');
      expect(res.status).toBe(200);
    }

    const fourth = await postForgot('a@b.com');
    expect(fourth.status).toBe(429);
    expect(fourth.text).toContain('quá nhiều lần');
  });

  it('validates the email format', async () => {
    const res = await postForgot('not-an-email');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Email không hợp lệ');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('requires a valid CAPTCHA before sending a reset link', async () => {
    verifyCaptcha.mockResolvedValue({ ok: false, reason: 'missing' });
    profileFindUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

    const res = await postForgot('a@b.com', '');

    expect(res.status).toBe(422);
    expect(res.text).toContain('captcha:missing');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('GET /reset with a valid token shows the form without consuming it', async () => {
    findUnique.mockResolvedValue(validRow);

    const res = await request(app).get('/reset?token=valid-token');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Đặt mật khẩu mới');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashResetToken('valid-token') },
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { ...validRow, expiresAt: new Date(Date.now() - 1_000) }],
    ['used', { ...validRow, usedAt: new Date() }],
  ])('GET /reset rejects a %s token', async (_label, row) => {
    findUnique.mockResolvedValue(row);

    const res = await request(app).get('/reset?token=bad-token');

    expect(res.status).toBe(400);
    expect(res.text).toContain('không hợp lệ hoặc đã hết hạn');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('POST /reset rejects a used token without changing the password', async () => {
    findUnique.mockResolvedValue({ ...validRow, usedAt: new Date() });

    const res = await postReset({
      token: 'used-token',
      password: 'newsecret',
      confirmPassword: 'newsecret',
    });

    expect(res.status).toBe(400);
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('POST /reset stores the new hash, revokes every session and redirects', async () => {
    findUnique.mockResolvedValue(validRow);
    updateMany.mockResolvedValue({ count: 1 });

    const res = await postReset({
      token: 'valid-token',
      password: 'newsecret',
      confirmPassword: 'newsecret',
    });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/login');
    expect(hashPassword).toHaveBeenCalledWith('newsecret');
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash', passwordChangedAt: expect.any(Date) },
    });
    expect(revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(clearSessionCookie).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'reset-1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { usedAt: expect.any(Date) },
    });
    // Slide 46: notify the owner that the password changed (no password inside).
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith('a@b.com');
  });

  it('revokes sessions even when resetting from another signed-in browser', async () => {
    state.currentUser = { id: 'user-1', email: 'a@b.com' };
    findUnique.mockResolvedValue(validRow);
    updateMany.mockResolvedValue({ count: 1 });

    const res = await postReset({
      token: 'valid-token',
      password: 'newsecret',
      confirmPassword: 'newsecret',
    });

    expect(res.status).toBe(303);
    expect(revokeAllSessions).toHaveBeenCalledWith('user-1');
  });

  it('rejects mismatched passwords before touching the token', async () => {
    findUnique.mockResolvedValue(validRow);

    const res = await postReset({
      token: 'valid-token',
      password: 'newsecret',
      confirmPassword: 'different',
    });

    expect(res.status).toBe(422);
    expect(res.text).toContain('không khớp');
    expect(updateMany).not.toHaveBeenCalled();
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('rejects a token that another request already consumed', async () => {
    findUnique.mockResolvedValue(validRow);
    updateMany.mockResolvedValue({ count: 0 });

    const res = await postReset({
      token: 'valid-token',
      password: 'newsecret',
      confirmPassword: 'newsecret',
    });

    expect(res.status).toBe(400);
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('reverts the claim when the profile update fails', async () => {
    findUnique.mockResolvedValue(validRow);
    updateMany.mockResolvedValue({ count: 1 });
    profileUpdate.mockRejectedValue(new Error('db down'));

    const res = await postReset({
      token: 'valid-token',
      password: 'newsecret',
      confirmPassword: 'newsecret',
    });

    expect(res.status).toBe(422);
    expect(res.text).toContain('Không thể đặt lại mật khẩu');
    expect(update).toHaveBeenCalledWith({ where: { id: 'reset-1' }, data: { usedAt: null } });
  });

  it('rejects POST /reset without a token', async () => {
    const res = await postReset({ password: 'newsecret', confirmPassword: 'newsecret' });

    expect(res.status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
