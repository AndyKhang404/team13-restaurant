import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const {
  verifyCaptcha,
  verifyPassword,
  hashPassword,
  profileFindUnique,
  profileCreate,
  profileUpdate,
  challengeFindUnique,
  challengeCreate,
  challengeUpdate,
  challengeUpdateMany,
  createSession,
  revokeSession,
  revokeAllSessions,
  setSessionCookie,
  clearSessionCookie,
  sendActivationOtpEmail,
} = vi.hoisted(() => ({
  verifyCaptcha: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  profileUpdate: vi.fn(),
  challengeFindUnique: vi.fn(),
  challengeCreate: vi.fn(),
  challengeUpdate: vi.fn(),
  challengeUpdateMany: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllSessions: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  sendActivationOtpEmail: vi.fn(),
}));

vi.mock('../src/middleware/security.js', () => ({
  browserId: (_req: unknown, _res: unknown, next: () => void) => next(),
  flash: (
    req: { flash?: unknown },
    res: { locals: Record<string, unknown> },
    next: () => void,
  ) => {
    req.flash = vi.fn();
    res.locals.flash = [];
    next();
  },
  multipart: (_req: unknown, _res: unknown, next: () => void) => next(),
  csrfProtection: (_req: unknown, _res: unknown, next: () => void) => next(),
  csrfToken: (
    _req: unknown,
    res: { locals: Record<string, unknown> },
    next: () => void,
  ) => {
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

vi.mock('../src/auth/session.js', () => ({
  SESSION_COOKIE: 'sid',
  createSession,
  revokeSession,
  revokeAllSessions,
  setSessionCookie,
  clearSessionCookie,
}));

vi.mock('../src/auth/password.js', () => ({
  DUMMY_PASSWORD_HASH: 'dummy',
  hashPassword,
  verifyPassword,
}));

vi.mock('../src/lib/mailer.js', () => ({
  sendActivationOtpEmail,
  sendPasswordResetEmail: vi.fn(),
  sendPasswordChangedEmail: vi.fn(async () => undefined),
  MailerNotConfiguredError: class MailerNotConfiguredError extends Error {},
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    profile: {
      findUnique: profileFindUnique,
      create: profileCreate,
      update: profileUpdate,
    },
    activationChallenge: {
      findUnique: challengeFindUnique,
      create: challengeCreate,
      update: challengeUpdate,
      updateMany: challengeUpdateMany,
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
  verifyCaptcha,
  captchaErrorMessage: (reason: string) => `captcha:${reason}`,
}));

import { createApp } from '../src/app.js';
import {
  getLoginAttemptState,
  registerFailedLogin,
  resetLoginAttempts,
} from '../src/auth/login-attempts.js';

const EMAIL = 'a@b.com';
const PASSWORD = 'secret123';
const ACTIVE_USER = {
  id: 'user-1',
  email: EMAIL,
  emailNormalized: EMAIL,
  displayName: null,
  passwordHash: 'stored-hash',
  role: 'VIEWER',
  status: 'ACTIVE',
};

describe('local login, CAPTCHA and brute-force policy', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetLoginAttempts();
    verifyPassword.mockResolvedValue(false);
    hashPassword.mockResolvedValue('stored-hash');
    profileFindUnique.mockResolvedValue(null);
    profileCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...ACTIVE_USER,
      ...data,
      status: 'PENDING',
    }));
    profileUpdate.mockResolvedValue({});
    challengeFindUnique.mockResolvedValue(null);
    challengeCreate.mockResolvedValue({});
    challengeUpdate.mockResolvedValue({});
    challengeUpdateMany.mockResolvedValue({ count: 1 });
    createSession.mockResolvedValue({
      sid: 'new-sid',
      expiresAt: new Date(Date.now() + 60_000),
    });
    revokeSession.mockResolvedValue(undefined);
    revokeAllSessions.mockResolvedValue(undefined);
    sendActivationOtpEmail.mockResolvedValue(undefined);
    // CAPTCHA is always required on login; default to a valid token.
    verifyCaptcha.mockResolvedValue({ ok: true });
    app = createApp();
  });

  function postLogin(extra: Record<string, string> = {}) {
    return request(app)
      .post('/login')
      .type('form')
      .send({ email: EMAIL, password: PASSWORD, ...extra });
  }

  it('requires CAPTCHA on every login and checks it before the password', async () => {
    profileFindUnique.mockResolvedValue(ACTIVE_USER);

    verifyCaptcha.mockResolvedValue({ ok: false, reason: 'missing' });
    const blocked = await postLogin();

    expect(blocked.status).toBe(422);
    expect(blocked.text).toContain('captcha:missing');
    expect(verifyCaptcha).toHaveBeenCalledOnce();
    // Password is never checked when CAPTCHA fails.
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('accepts a valid CAPTCHA and then verifies the password', async () => {
    profileFindUnique.mockResolvedValue(ACTIVE_USER);
    verifyCaptcha.mockResolvedValue({ ok: true });

    const res = await postLogin({ 'g-recaptcha-response': 'valid-token' });

    expect(verifyCaptcha).toHaveBeenCalledOnce();
    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(res.status).toBe(401);
    expect(getLoginAttemptState(EMAIL).failures).toBe(1);
  });

  it('keeps counting wrong passwords even when CAPTCHA is valid', async () => {
    profileFindUnique.mockResolvedValue(ACTIVE_USER);
    registerFailedLogin(['email:a@b.com', 'ip:::ffff:127.0.0.1']);
    registerFailedLogin(['email:a@b.com', 'ip:::ffff:127.0.0.1']);
    registerFailedLogin(['email:a@b.com', 'ip:::ffff:127.0.0.1']);
    verifyCaptcha.mockResolvedValue({ ok: true });

    const res = await postLogin({ 'g-recaptcha-response': 'valid-token' });

    expect(res.status).toBe(401);
    expect(verifyCaptcha).toHaveBeenCalledOnce();
    expect(getLoginAttemptState(EMAIL).failures).toBe(4);
  });

  it('returns 429 after ten failures and ignores a valid CAPTCHA while locked', async () => {
    profileFindUnique.mockResolvedValue(ACTIVE_USER);
    for (let i = 0; i < 9; i += 1) registerFailedLogin(EMAIL);
    verifyCaptcha.mockResolvedValue({ ok: true });

    const tenth = await postLogin({ 'g-recaptcha-response': 'valid-token' });
    expect(tenth.status).toBe(429);
    expect(getLoginAttemptState(EMAIL).lockedUntil).not.toBeNull();

    verifyCaptcha.mockClear();
    const passwordChecksBefore = verifyPassword.mock.calls.length;
    const locked = await postLogin({ 'g-recaptcha-response': 'valid-token' });

    expect(locked.status).toBe(429);
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(verifyPassword).toHaveBeenCalledTimes(passwordChecksBefore);
  });

  it('clears the email counter and creates a server-side session on success', async () => {
    profileFindUnique.mockResolvedValue(ACTIVE_USER);
    verifyPassword.mockResolvedValue(true);
    registerFailedLogin(EMAIL);

    const res = await postLogin();

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin');
    expect(createSession).toHaveBeenCalledWith('user-1');
    expect(setSessionCookie).toHaveBeenCalledWith(expect.anything(), 'new-sid', expect.any(Date));
    expect(getLoginAttemptState(EMAIL).failures).toBe(0);
  });

  it('does not create a session for a correct password on a pending account', async () => {
    profileFindUnique.mockResolvedValue({ ...ACTIVE_USER, status: 'PENDING' });
    verifyPassword.mockResolvedValue(true);

    const res = await postLogin();

    expect(res.status).toBe(403);
    expect(res.text).toContain('chưa được kích hoạt');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('always requires CAPTCHA for registration and never echoes the OTP', async () => {
    verifyCaptcha.mockResolvedValue({ ok: false, reason: 'missing' });

    const missing = await request(app).post('/register').type('form').send({
      email: 'new@b.com',
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });

    expect(missing.status).toBe(200);
    expect(missing.text).toContain('captcha:missing');
    expect(profileCreate).not.toHaveBeenCalled();

    verifyCaptcha.mockResolvedValue({ ok: true });
    const ok = await request(app).post('/register').type('form').send({
      email: 'new@b.com',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      'g-recaptcha-response': 'valid-token',
    });

    expect(ok.status).toBe(200);
    expect(profileCreate).toHaveBeenCalledOnce();
    expect(profileCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailNormalized: 'new@b.com',
        role: 'VIEWER',
        status: 'PENDING',
        passwordHash: 'stored-hash',
      }),
    });
    expect(sendActivationOtpEmail).toHaveBeenCalledOnce();
    const otp = sendActivationOtpEmail.mock.calls[0]?.[1] as string;
    expect(otp).toMatch(/^\d{6}$/);
    expect(ok.text).not.toContain(otp);
  });

  it('ignores a role supplied in the registration body (server assigns VIEWER)', async () => {
    verifyCaptcha.mockResolvedValue({ ok: true });

    const res = await request(app).post('/register').type('form').send({
      email: 'new@b.com',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      role: 'admin',
      'g-recaptcha-response': 'valid-token',
    });

    expect(res.status).toBe(200);
    expect(profileCreate).toHaveBeenCalledOnce();
    const data = profileCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.role).toBe('VIEWER');
  });

  it('does not accept an activation OTP as the login password', async () => {
    // The stored password hash is the real password; the OTP digits never match.
    profileFindUnique.mockResolvedValue(ACTIVE_USER);
    verifyPassword.mockResolvedValue(false);

    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: EMAIL, password: '123456' });

    expect(res.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns the same generic response for an existing active email without creating another user', async () => {
    verifyCaptcha.mockResolvedValue({ ok: true });
    profileFindUnique.mockResolvedValue(ACTIVE_USER);

    const existing = await request(app).post('/register').type('form').send({
      email: EMAIL,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      'g-recaptcha-response': 'valid-token',
    });

    profileFindUnique.mockResolvedValue(null);
    const fresh = await request(app).post('/register').type('form').send({
      email: 'new@b.com',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      'g-recaptcha-response': 'valid-token',
    });

    expect(existing.status).toBe(200);
    expect(fresh.status).toBe(200);
    // Same generic check-email message for both (slide 10/20 — no enumeration);
    // only the echoed address differs, which the user already typed.
    expect(existing.text).toContain('Kiểm tra email');
    expect(fresh.text).toContain('Kiểm tra email');
    expect(profileCreate).toHaveBeenCalledOnce();
    // Only the fresh sign-up triggers the OTP mail, not the existing email.
    expect(sendActivationOtpEmail).toHaveBeenCalledOnce();
  });

  it('re-issues the OTP for a pending email but never creates a new user', async () => {
    verifyCaptcha.mockResolvedValue({ ok: true });
    profileFindUnique.mockResolvedValue({ ...ACTIVE_USER, status: 'PENDING' });

    const res = await request(app).post('/register').type('form').send({
      email: EMAIL,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      'g-recaptcha-response': 'valid-token',
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Kiểm tra email');
    expect(profileCreate).not.toHaveBeenCalled();
  });

  it('returns 200 with VALIDATION_FAILED behavior for malformed registration', async () => {
    const res = await request(app).post('/register').type('form').send({
      email: 'not-an-email',
      password: '123',
      confirmPassword: '123',
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Dữ liệu đăng ký không hợp lệ.');
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(profileCreate).not.toHaveBeenCalled();
  });
});
