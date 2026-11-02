import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AccountStatus } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import { safeNext } from '../lib/http.js';
import { toFieldErrors } from '../lib/validation.js';
import { verifyCaptcha, captchaErrorMessage } from '../lib/captcha.js';
import {
  MailerNotConfiguredError,
  sendActivationOtpEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from '../lib/mailer.js';
import {
  OTP_LOCK_MS,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  isChallengeLocked,
  otpExpiry,
  resendDecision,
  verifyOtpHash,
} from './activation.js';
import { normalizeEmail } from './email.js';
import {
  attemptKeys,
  clearLoginAttempts,
  emailKey,
  getLoginAttemptState,
  isLocked,
  registerFailedLogin,
} from './login-attempts.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';
import {
  decideForgotRequest,
  createResetToken,
  ensureMinimumDuration,
  hashResetToken,
  isResetRequestValid,
  resetTokenExpiry,
} from './password-reset.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  revokeAllSessions,
  revokeSession,
  setSessionCookie,
} from './session.js';
import { authRateLimit } from '../middleware/rate-limit.js';

const router = Router();

router.use((_req, res, next) => {
  res.locals.captchaSiteKey = env.CAPTCHA_SITE_KEY;
  next();
});

const PasswordSchema = z
  .string()
  .min(6, 'Mật khẩu phải ít nhất 6 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự');

const LoginSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

const RegisterSchema = z
  .object({
    displayName: z.string().trim().max(100, 'Tên hiển thị tối đa 100 ký tự').optional(),
    email: z.email('Email không hợp lệ').trim(),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

const EmailSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
});

const ActivationSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
  otp: z.string().regex(/^\d{6}$/, 'Mã OTP phải gồm 6 chữ số'),
});

const ResetSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

const RESET_INVALID_MESSAGE = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.';
const FORGOT_SENT_MESSAGE = 'Nếu email đã đăng ký, hướng dẫn đã được gửi.';
const ACTIVATION_SENT_MESSAGE =
  'Nếu email hợp lệ và chưa kích hoạt, chúng tôi đã gửi mã OTP. Mã có hiệu lực trong 10 phút.';
const INVALID_OTP_MESSAGE = 'Mã OTP không đúng hoặc đã hết hạn.';
const LOCKED_MESSAGE = 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.';
const PENDING_MESSAGE =
  'Tài khoản chưa được kích hoạt. Vui lòng nhập mã OTP trong email trước khi đăng nhập.';

function renderResetInvalid(res: Response, status = 400) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).render('pages/auth/reset', {
    title: 'Reset password',
    token: '',
    values: {},
    invalidLink: true,
    formError: RESET_INVALID_MESSAGE,
  });
}

function renderCheckEmail(
  res: Response,
  email: string,
  opts: { message?: string; status?: number; formError?: string } = {},
) {
  return res.status(opts.status ?? 200).render('pages/auth/check-email', {
    title: 'Check your email',
    email,
    message: opts.message ?? ACTIVATION_SENT_MESSAGE,
    formError: opts.formError,
  });
}

function mailFailureCode(error: unknown): string {
  return error instanceof MailerNotConfiguredError ? 'not-configured' : 'delivery-failed';
}

async function issueActivationOtp(profile: {
  id: string;
  email: string;
  displayName: string | null;
}): Promise<'sent' | 'used' | 'cooldown' | 'max'> {
  const now = new Date();
  const challenge = await prisma.activationChallenge.findUnique({
    where: { userId: profile.id },
  });

  let sendCount = 1;
  let sendWindowStart = now;
  if (challenge) {
    const decision = resendDecision(challenge, now.getTime());
    if (!decision.allowed) return decision.reason;
    sendCount = decision.sendCount;
    sendWindowStart = decision.sendWindowStart;
  }

  const otp = generateOtp();
  const common = {
    purpose: 'activation',
    otpHash: hashOtp(profile.id, otp),
    expiresAt: otpExpiry(now.getTime()),
    lastSentAt: now,
    sendCount,
    sendWindowStart,
    usedAt: null,
  };

  if (challenge) {
    await prisma.activationChallenge.update({ where: { userId: profile.id }, data: common });
  } else {
    await prisma.activationChallenge.create({ data: { userId: profile.id, ...common } });
  }

  await sendActivationOtpEmail(profile.email, otp, {
    name: profile.displayName,
    ttlMinutes: Math.round(OTP_TTL_MS / 60_000),
  });
  return 'sent';
}

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(303, safeNext(req.query.next, '/'));
  res.render('pages/auth/login', {
    title: 'Sign in',
    next: req.query.next ?? '',
    values: {},
    captchaRequired: true,
  });
});

router.post('/login', authRateLimit(), async (req, res) => {
  const next = req.body?.next;
  if (req.user) return res.redirect(303, safeNext(next, '/'));
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).render('pages/auth/login', {
      title: 'Sign in',
      next,
      values: req.body,
      errors: toFieldErrors(parsed.error),
      captchaRequired: true,
    });
  }

  const email = normalizeEmail(parsed.data.email);
  const keys = attemptKeys(email, req.ip);
  const state = getLoginAttemptState(keys);

  if (isLocked(state)) {
    return res.status(429).render('pages/auth/login', {
      title: 'Sign in',
      next,
      values: { email: parsed.data.email },
      formError: LOCKED_MESSAGE,
      captchaRequired: true,
    });
  }

  // CAPTCHA is always required on login (not only after failures).
  const captcha = await verifyCaptcha(req.body?.['g-recaptcha-response'], req.ip);
  if (!captcha.ok) {
    return res.status(422).render('pages/auth/login', {
      title: 'Sign in',
      next,
      values: { email: parsed.data.email },
      formError: captchaErrorMessage(captcha.reason),
      captchaRequired: true,
    });
  }

  const profile = await prisma.profile.findUnique({ where: { emailNormalized: email } });
  const passwordOk = await verifyPassword(
    parsed.data.password,
    profile?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!profile || !passwordOk) {
    const updated = registerFailedLogin(keys);
    if (isLocked(updated)) {
      return res.status(429).render('pages/auth/login', {
        title: 'Sign in',
        next,
        values: { email: parsed.data.email },
        formError: LOCKED_MESSAGE,
        captchaRequired: true,
      });
    }
    return res.status(401).render('pages/auth/login', {
      title: 'Sign in',
      next,
      values: { email: parsed.data.email },
      formError: 'Email hoặc mật khẩu không đúng.',
      captchaRequired: true,
    });
  }

  if (profile.status !== AccountStatus.ACTIVE) {
    return res.status(403).render('pages/auth/login', {
      title: 'Sign in',
      next,
      values: { email: parsed.data.email },
      formError: PENDING_MESSAGE,
      captchaRequired: true,
    });
  }

  clearLoginAttempts(emailKey(email));

  const oldSid = typeof req.cookies?.[SESSION_COOKIE] === 'string' ? req.cookies[SESSION_COOKIE] : '';
  if (oldSid) await revokeSession(oldSid);

  const { sid, expiresAt } = await createSession(profile.id);
  setSessionCookie(res, sid, expiresAt);
  req.flash('success', 'Đăng nhập thành công.');
  return res.redirect(303, safeNext(next, '/admin'));
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect(303, '/');
  res.render('pages/auth/register', { title: 'Create account', values: {} });
});

router.post('/register', authRateLimit(), async (req, res) => {
  if (req.user) return res.redirect(303, '/');
  const parsed = RegisterSchema.safeParse(req.body);
  const values = { displayName: req.body?.displayName, email: req.body?.email };
  if (!parsed.success) {
    return res.status(200).render('pages/auth/register', {
      title: 'Create account',
      values,
      errors: toFieldErrors(parsed.error),
      formError: 'Dữ liệu đăng ký không hợp lệ.',
      errorCode: 'VALIDATION_FAILED',
    });
  }

  const captcha = await verifyCaptcha(req.body?.['g-recaptcha-response'], req.ip);
  if (!captcha.ok) {
    return res.status(200).render('pages/auth/register', {
      title: 'Create account',
      values,
      formError: captchaErrorMessage(captcha.reason),
      errorCode: 'CAPTCHA_FAILED',
    });
  }

  const startedAt = Date.now();
  const email = normalizeEmail(parsed.data.email);
  const displayName =
    parsed.data.displayName && parsed.data.displayName.trim() !== ''
      ? parsed.data.displayName.trim()
      : null;

  try {
    const existing = await prisma.profile.findUnique({ where: { emailNormalized: email } });
    if (existing) {
      // Slides 10 & 20: an already-registered email must receive the same
      // generic response as a new one (no account enumeration). If the account
      // is still pending, re-issue the OTP under the normal cooldown/cap rules.
      if (existing.status === AccountStatus.PENDING) {
        await issueActivationOtp(existing).catch((error: unknown) => {
          console.warn('[register] activation email failed', mailFailureCode(error));
        });
      }
      await ensureMinimumDuration(startedAt);
      return renderCheckEmail(res, parsed.data.email);
    }

    const profile = await prisma.profile.create({
      data: {
        id: randomUUID(),
        email: parsed.data.email,
        emailNormalized: email,
        passwordHash: await hashPassword(parsed.data.password),
        displayName,
        role: 'VIEWER',
        status: AccountStatus.PENDING,
      },
    });

    await issueActivationOtp(profile);
    await ensureMinimumDuration(startedAt);
    return renderCheckEmail(res, parsed.data.email);
  } catch (error) {
    console.warn('[register] activation email failed', mailFailureCode(error));
    await ensureMinimumDuration(startedAt);
    return res.status(500).render('pages/auth/register', {
      title: 'Create account',
      values,
      formError: 'Không thể gửi email kích hoạt. Vui lòng thử lại sau.',
    });
  }
});

router.get('/activate', (req, res) => {
  if (req.user) return res.redirect(303, '/');
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  res.render('pages/auth/activate', {
    title: 'Activate account',
    email,
    values: { email },
  });
});

router.post('/activate', authRateLimit(), async (req, res) => {
  const parsed = ActivationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(200).render('pages/auth/activate', {
      title: 'Activate account',
      email: typeof req.body?.email === 'string' ? req.body.email : '',
      values: { email: req.body?.email },
      errors: toFieldErrors(parsed.error),
      formError: 'Dữ liệu không hợp lệ.',
    });
  }

  const email = normalizeEmail(parsed.data.email);
  const profile = await prisma.profile.findUnique({ where: { emailNormalized: email } });
  if (!profile || profile.status === AccountStatus.ACTIVE) {
    return res.status(422).render('pages/auth/activate', {
      title: 'Activate account',
      email: parsed.data.email,
      values: { email: parsed.data.email },
      formError: INVALID_OTP_MESSAGE,
    });
  }

  const challenge = await prisma.activationChallenge.findUnique({
    where: { userId: profile.id },
  });
  if (!challenge || challenge.purpose !== 'activation') {
    return res.status(422).render('pages/auth/activate', {
      title: 'Activate account',
      email: parsed.data.email,
      values: { email: parsed.data.email },
      formError: INVALID_OTP_MESSAGE,
    });
  }

  const now = new Date();
  if (isChallengeLocked(challenge, now.getTime())) {
    return res.status(429).render('pages/auth/activate', {
      title: 'Activate account',
      email: parsed.data.email,
      values: { email: parsed.data.email },
      formError: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    });
  }

  if (challenge.usedAt !== null || challenge.expiresAt.getTime() <= now.getTime()) {
    return res.status(422).render('pages/auth/activate', {
      title: 'Activate account',
      email: parsed.data.email,
      values: { email: parsed.data.email },
      formError: INVALID_OTP_MESSAGE,
    });
  }

  if (!verifyOtpHash(profile.id, parsed.data.otp, challenge.otpHash)) {
    const attempts = challenge.attempts + 1;
    const lockedUntil =
      attempts >= OTP_MAX_ATTEMPTS ? new Date(now.getTime() + OTP_LOCK_MS) : challenge.lockedUntil;
    await prisma.activationChallenge.update({
      where: { userId: profile.id },
      data: { attempts, lockedUntil },
    });
    if (lockedUntil !== null && lockedUntil.getTime() > now.getTime()) {
      return res.status(429).render('pages/auth/activate', {
        title: 'Activate account',
        email: parsed.data.email,
        values: { email: parsed.data.email },
        formError: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      });
    }
    return res.status(422).render('pages/auth/activate', {
      title: 'Activate account',
      email: parsed.data.email,
      values: { email: parsed.data.email },
      formError: INVALID_OTP_MESSAGE,
    });
  }

  const claim = await prisma.activationChallenge.updateMany({
    where: {
      userId: profile.id,
      purpose: 'activation',
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });
  if (claim.count === 0) {
    return res.status(422).render('pages/auth/activate', {
      title: 'Activate account',
      email: parsed.data.email,
      values: { email: parsed.data.email },
      formError: INVALID_OTP_MESSAGE,
    });
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { status: AccountStatus.ACTIVE, emailVerifiedAt: now },
  });

  req.flash('success', 'Email đã được xác minh. Vui lòng đăng nhập.');
  return res.redirect(303, '/login');
});

router.post('/activate/resend', authRateLimit(), async (req, res) => {
  const parsed = EmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return renderCheckEmail(res, typeof req.body?.email === 'string' ? req.body.email : '');
  }

  const email = normalizeEmail(parsed.data.email);
  const profile = await prisma.profile.findUnique({ where: { emailNormalized: email } });
  if (!profile || profile.status === AccountStatus.ACTIVE) {
    return renderCheckEmail(res, parsed.data.email);
  }

  try {
    const result = await issueActivationOtp(profile);
    if (result === 'cooldown' || result === 'max') {
      return renderCheckEmail(res, parsed.data.email, {
        status: 429,
        formError: 'Bạn đã yêu cầu gửi lại quá nhiều lần. Vui lòng thử lại sau.',
      });
    }
  } catch (error) {
    console.warn('[activate] resend email failed', mailFailureCode(error));
    return renderCheckEmail(res, parsed.data.email, {
      status: 500,
      formError: 'Không thể gửi lại email. Vui lòng thử lại sau.',
    });
  }

  return renderCheckEmail(res, parsed.data.email);
});

router.get('/forgot', (req, res) => {
  if (req.user) return res.redirect(303, '/');
  res.render('pages/auth/forgot', { title: 'Forgot password', values: {}, captchaRequired: true });
});

router.post('/forgot', authRateLimit(), async (req, res) => {
  const startedAt = Date.now();
  const parsed = EmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).render('pages/auth/forgot', {
      title: 'Forgot password',
      values: { email: typeof req.body?.email === 'string' ? req.body.email : '' },
      errors: toFieldErrors(parsed.error),
      captchaRequired: true,
    });
  }

  const captcha = await verifyCaptcha(req.body?.['g-recaptcha-response'], req.ip);
  if (!captcha.ok) {
    return res.status(422).render('pages/auth/forgot', {
      title: 'Forgot password',
      values: { email: parsed.data.email },
      formError: captchaErrorMessage(captcha.reason),
      captchaRequired: true,
    });
  }

  const email = normalizeEmail(parsed.data.email);
  const decision = decideForgotRequest(email);
  if (!decision.allowed) {
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    return res.status(429).render('pages/auth/forgot', {
      title: 'Forgot password',
      values: { email: parsed.data.email },
      formError:
        decision.reason === 'cooldown'
          ? `Vui lòng đợi ${decision.retryAfterSeconds} giây trước khi yêu cầu lại.`
          : 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      captchaRequired: true,
    });
  }

  const user = await prisma.profile.findUnique({ where: { emailNormalized: email } });
  if (user) {
    const token = createResetToken();
    const now = new Date();
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        email: user.email,
        tokenHash: hashResetToken(token),
        expiresAt: resetTokenExpiry(),
      },
    });

    const resetUrl = `${env.APP_URL}/reset?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(user.email, resetUrl, { ttlMinutes: 15 }).catch(
      (error: unknown) => {
        console.warn('[forgot] reset email failed', mailFailureCode(error));
      },
    );
  }

  await ensureMinimumDuration(startedAt);
  return res.status(200).render('pages/auth/forgot', {
    title: 'Forgot password',
    sent: true,
    message: FORGOT_SENT_MESSAGE,
  });
});

router.get('/reset', async (req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token || typeof req.query.error === 'string') {
    return renderResetInvalid(res);
  }

  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!row || !isResetRequestValid(row)) {
    return renderResetInvalid(res);
  }

  res.render('pages/auth/reset', {
    title: 'Reset password',
    token,
    values: {},
  });
});

router.post('/reset', authRateLimit(), async (req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');

  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!token) return renderResetInvalid(res);

  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!row || !isResetRequestValid(row)) {
    return renderResetInvalid(res);
  }

  const parsed = ResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).render('pages/auth/reset', {
      title: 'Reset password',
      token,
      values: {},
      errors: toFieldErrors(parsed.error),
    });
  }

  const now = new Date();
  const claim = await prisma.passwordReset.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claim.count === 0) return renderResetInvalid(res);

  try {
    await prisma.profile.update({
      where: { id: row.userId },
      data: {
        passwordHash: await hashPassword(parsed.data.password),
        passwordChangedAt: now,
      },
    });
  } catch {
    await prisma.passwordReset
      .update({ where: { id: row.id }, data: { usedAt: null } })
      .catch(() => undefined);
    return res.status(422).render('pages/auth/reset', {
      title: 'Reset password',
      token,
      values: {},
      formError: 'Không thể đặt lại mật khẩu. Vui lòng thử lại hoặc yêu cầu liên kết mới.',
    });
  }

  await prisma.passwordReset.updateMany({
    where: { userId: row.userId, usedAt: null },
    data: { usedAt: now },
  });
  await revokeAllSessions(row.userId);
  clearSessionCookie(res);

  // Slide 46: notify the owner that the password changed (never includes the
  // password). A mail failure must not undo a completed reset.
  await sendPasswordChangedEmail(row.email).catch((error: unknown) => {
    console.warn('[reset] password-changed email failed', mailFailureCode(error));
  });

  req.flash('success', 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.');
  res.redirect(303, '/login');
});

router.post('/logout', async (req, res) => {
  const sid = typeof req.cookies?.[SESSION_COOKIE] === 'string' ? req.cookies[SESSION_COOKIE] : '';
  if (sid) await revokeSession(sid);
  clearSessionCookie(res);
  req.flash('info', 'Bạn đã đăng xuất.');
  res.redirect(303, '/');
});

export default router;
