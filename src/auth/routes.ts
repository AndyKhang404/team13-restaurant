import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { EmailOtpType } from '@supabase/supabase-js';
import { ProfileStatus, Role } from '../generated/prisma/enums.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import {
  clearSupabaseAuthCookies,
  createSupabaseForRequest,
  createStatelessClient,
  getBearerToken,
  supabaseAdmin,
} from '../lib/supabase.js';
import { safeNext, sendOk, sendError, sendBusinessError } from '../lib/http.js';
import { toFieldErrors } from '../lib/validation.js';
import { verifyCaptcha, captchaErrorMessage } from '../lib/captcha.js';
import {
  MFA_MAX_ATTEMPTS,
  findTotpFactor,
  generateRecoveryCodes,
  hasVerifiedMfa,
  hashMfaCode,
  hashRecoveryCode,
  isMfaLocked,
  isReplayedMfaCode,
  mapMfaError,
  mfaLockMinutes,
  normalizeRecoveryCode,
  registerMfaFailure,
  type SupabaseAuthErrorLike,
} from './mfa.js';
import {
  createMfaChallenge,
  deleteMfaChallenge,
  getMfaChallenge,
  registerMfaChallengeFailure,
} from './mfa-challenges.js';
import {
  attemptKeys,
  clearLoginAttempts,
  emailKey,
  getLoginAttemptState,
  ipKey,
  isCaptchaRequired,
  registerFailedLogin,
} from './login-attempts.js';
import { normalizeEmail } from './email.js';
import { can } from './permissions.js';
import { ACCOUNT_SUSPENDED_MESSAGE } from './policy.js';
import { hasOtherActiveAdmin } from './user-guards.js';
import { requireAuth } from './middleware.js';
import { authRateLimit, otpRateLimit } from '../middleware/rate-limit.js';
import { generateCsrfToken } from '../middleware/security.js';
import { recordPasswordReset } from './token-revocation.js';

const router = Router();

const LoginSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

const RegisterSchema = z
  .object({
    displayName: z.string().trim().max(100, 'Tên hiển thị tối đa 100 ký tự').optional(),
    email: z.email('Email không hợp lệ').trim(),
    password: z
      .string()
      .min(6, 'Mật khẩu phải ít nhất 6 ký tự')
      .max(72, 'Mật khẩu tối đa 72 ký tự'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

const VerifyOtpSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
  token: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => /^\d{6}$/.test(s), {
      message: 'Mã xác nhận phải gồm đúng 6 chữ số',
    }),
});

const ResendOtpSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
});

const ForgotPasswordSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
});

const ResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, 'Mật khẩu phải ít nhất 6 ký tự')
      .max(72, 'Mật khẩu tối đa 72 ký tự'),
    confirmPassword: z.string(),
    currentPassword: z.string().optional(),
    token: z.string().optional(),
    token_hash: z.string().optional(),
    code: z.string().optional(),
    email: z.string().optional(),
    otp: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

const DeleteAccountSchema = z.object({
  email: z.email('Email không hợp lệ').trim(),
});

const TotpCodeSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .refine((s) => /^\d{6}$/.test(s), {
    message: 'Mã xác thực phải gồm đúng 6 chữ số',
  });

const MfaEnrollVerifySchema = z.object({
  factorId: z.string().min(1, 'Thiếu thông tin xác thực hai lớp'),
  code: TotpCodeSchema,
});

const MfaVerifySchema = z.object({
  challengeId: z.string().min(1, 'Thiếu mã phiên xác thực'),
  code: TotpCodeSchema,
});

const MfaRecoveryVerifySchema = z.object({
  challengeId: z.string().min(1, 'Thiếu mã phiên xác thực'),
  code: z.string().trim().min(1, 'Vui lòng nhập mã khôi phục'),
});

const MfaDisableSchema = z
  .object({
    password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
    code: z.string().optional(),
    recoveryCode: z.string().optional(),
  })
  .refine((d) => Boolean(d.code?.trim() || d.recoveryCode?.trim()), {
    path: ['code'],
    message: 'Vui lòng nhập mã xác thực hoặc mã khôi phục',
  });

const MfaRecoveryCodesSchema = z.object({
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
  code: TotpCodeSchema,
});

function withMfa<T extends object>(profile: T | null, mfaEnabled: boolean) {
  return profile ? { ...profile, mfaEnabled } : null;
}

async function getMfaState(userId: string) {
  return prisma.mfaState.findUnique({ where: { userId } });
}

/** Creates/updates the non-secret mirror of Supabase's verified factor. */
async function ensureMfaState(userId: string, factorId: string | null) {
  const existing = await getMfaState(userId);
  if (!existing) {
    return prisma.mfaState.create({
      data: { userId, factorId, enabledAt: new Date() },
    });
  }
  if (!existing.enabledAt || existing.factorId !== factorId) {
    return prisma.mfaState.update({
      where: { userId },
      data: { factorId, enabledAt: existing.enabledAt ?? new Date() },
    });
  }
  return existing;
}

async function markMfaFailure(userId: string) {
  const state = await getMfaState(userId);
  const next = registerMfaFailure(state?.failedAttempts ?? 0);
  await prisma.mfaState.upsert({
    where: { userId },
    create: {
      userId,
      failedAttempts: next.failedAttempts,
      lockedUntil: next.lockedUntil,
    },
    update: {
      failedAttempts: next.failedAttempts,
      lockedUntil: next.lockedUntil,
    },
  });
  return next;
}

function sendMfaError(
  res: Response,
  error: SupabaseAuthErrorLike,
  fields?: Record<string, string>,
) {
  const mapped = mapMfaError(error);
  return sendBusinessError(res, mapped.code, mapped.message, fields);
}

function sendMfaLocked(res: Response, lockedUntil: Date) {
  const minutes = mfaLockMinutes(lockedUntil);
  return sendBusinessError(
    res,
    'MFA_LOCKED',
    `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
    { retryAfterMinutes: String(minutes) },
  );
}

interface MfaChallengeSummary {
  challengeId: string;
  expiresIn: number;
  recoveryOnly: boolean;
}

interface SupabaseUserLike {
  id: string;
  email?: string | null;
  factors?: Array<{
    id: string;
    factor_type?: string;
    status?: string;
    friendly_name?: string;
  }>;
}

/**
 * Creates a login challenge for a verified MFA user. Returns `lockedUntil`
 * when the account is temporarily locked.
 */
async function prepareMfaChallenge(
  user: SupabaseUserLike,
  session: { access_token: string; refresh_token?: string },
  redirectTo: string,
): Promise<MfaChallengeSummary | { lockedUntil: Date }> {
  const totp = findTotpFactor(user);
  const state = await ensureMfaState(user.id, totp?.id ?? null);
  if (isMfaLocked(state.lockedUntil)) {
    return { lockedUntil: state.lockedUntil! };
  }

  const challenge = createMfaChallenge({
    userId: user.id,
    factorId: totp?.id ?? null,
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? '',
    email: user.email ?? '',
    redirectTo,
  });

  return {
    challengeId: challenge.id,
    expiresIn: Math.round((challenge.expiresAt - Date.now()) / 1000),
    recoveryOnly: !totp,
  };
}

/** Copies a Supabase session into the httpOnly auth cookies. */
async function attachSessionCookies(
  req: Request,
  res: Response,
  session: { access_token: string; refresh_token?: string },
) {
  const supabase = createSupabaseForRequest(req, res);
  return supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? '',
  });
}

/** Origin embedded in auth emails so links land on the browsable SPA. */
const emailRedirectOrigin = () => env.EMAIL_REDIRECT_ORIGIN ?? env.APP_URL;

/** Where to send a user after login: requested page, else /admin for staff, else home. */
async function landingFor(userId: string, email: string, next: unknown): Promise<string> {
  const profile = await prisma.profile.upsert({
    where: { id: userId },
    create: { id: userId, email },
    update: {},
  });
  const fallback = can(profile, 'admin:access') ? '/admin' : '/';
  return safeNext(next, fallback);
}

/** Returns the authenticated user session and fresh CSRF token. */
router.get('/me', (req, res) => {
  const csrf = generateCsrfToken(req, res);
  return sendOk(res, {
    user: withMfa(req.user, Boolean(res.locals.mfaEnabled)),
    csrfToken: csrf,
    mfaRequired: Boolean(req.mfaRequired),
  });
});

/** Public captcha config and whether the current email/IP must solve it. */
router.get('/captcha', (req, res) => {
  const email = typeof req.query.email === 'string' ? normalizeEmail(req.query.email) : '';
  const state = getLoginAttemptState(email ? attemptKeys(email, req.ip) : ipKey(req.ip));
  return sendOk(res, {
    siteKey: env.CAPTCHA_SITE_KEY,
    required: isCaptchaRequired(state),
  });
});

/** POST /api/auth/login */
async function handleLogin(req: Request, res: Response) {
  const next = req.body?.next;
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu đăng nhập không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const keys = attemptKeys(email, req.ip);

  if (isCaptchaRequired(getLoginAttemptState(keys))) {
    const rawCaptcha = req.body?.['g-recaptcha-response'];
    if (!rawCaptcha) {
      return sendBusinessError(
        res,
        'CAPTCHA_REQUIRED',
        'Vui lòng xác nhận bạn không phải robot.',
      );
    }
    const captcha = await verifyCaptcha(rawCaptcha, req.ip);
    if (!captcha.ok) {
      return sendBusinessError(
        res,
        'INVALID_CAPTCHA',
        captchaErrorMessage(captcha.reason),
      );
    }
  }

  const auth = createStatelessClient();
  const { data, error } = await auth.auth.signInWithPassword(parsed.data);
  if (error || !data.user || !data.session) {
    if (
      error?.code === 'email_not_confirmed' ||
      error?.message?.toLowerCase().includes('email not confirmed')
    ) {
      return sendBusinessError(
        res,
        'ACCOUNT_NOT_ACTIVATED',
        'Tài khoản chưa được kích hoạt. Vui lòng xác nhận mã OTP.',
      );
    }
    registerFailedLogin(keys);
    return sendBusinessError(
      res,
      'INVALID_CREDENTIALS',
      'Email hoặc mật khẩu không đúng.',
    );
  }

  clearLoginAttempts(emailKey(email));

  const existingProfile = await prisma.profile.findUnique({ where: { id: data.user.id } });
  if (existingProfile?.status === ProfileStatus.SUSPENDED) {
    await auth.auth.signOut({ scope: 'local' });
    clearSupabaseAuthCookies(req, res);
    return sendError(res, 403, 'ACCOUNT_SUSPENDED', ACCOUNT_SUSPENDED_MESSAGE);
  }

  const redirectTo = await landingFor(data.user.id, data.user.email ?? parsed.data.email, next);

  // Fail closed: without fresh factor data we must not issue an AAL1 token.
  const { data: userData, error: userError } = await auth.auth.getUser(
    data.session.access_token,
  );
  if (userError || !userData.user) {
    return sendError(
      res,
      500,
      'MFA_CHECK_FAILED',
      'Không thể kiểm tra xác thực hai lớp. Vui lòng thử lại.',
    );
  }

  if (hasVerifiedMfa(userData.user)) {
    const challenge = await prepareMfaChallenge(userData.user, data.session, redirectTo);
    if ('lockedUntil' in challenge) {
      return sendMfaLocked(res, challenge.lockedUntil);
    }
    // The stateless login client never wrote session cookies; clear any stale
    // AAL1 cookie from a previous session as a defensive measure.
    clearSupabaseAuthCookies(req, res);
    return sendOk(res, {
      mfaRequired: true,
      ...challenge,
      message: 'Vui lòng nhập mã xác thực hai lớp.',
    });
  }

  // No verified factor: clear a stale mirror, then issue the normal session.
  await prisma.mfaState.deleteMany({ where: { userId: data.user.id } });

  const { error: setSessionError } = await attachSessionCookies(req, res, data.session);
  if (setSessionError) {
    return sendError(
      res,
      500,
      'AUTH_ERROR',
      'Không thể tạo phiên đăng nhập. Vui lòng thử lại.',
    );
  }

  const profile =
    existingProfile ?? (await prisma.profile.findUnique({ where: { id: data.user.id } }));

  return sendOk(res, {
    user: withMfa(profile, false),
    token: data.session.access_token,
    accessToken: data.session.access_token,
    expiresIn: data.session.expires_in ?? 3600,
    session: data.session,
    redirectTo,
    message: 'Đăng nhập thành công.',
  });
}

/** POST /api/auth/register */
async function handleRegister(req: Request, res: Response) {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu đăng ký không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const rawCaptcha = req.body?.['g-recaptcha-response'];
  if (!rawCaptcha) {
    return sendBusinessError(
      res,
      'CAPTCHA_REQUIRED',
      'Vui lòng xác nhận bạn không phải robot.',
    );
  }
  const captcha = await verifyCaptcha(rawCaptcha, req.ip);
  if (!captcha.ok) {
    return sendBusinessError(
      res,
      'INVALID_CAPTCHA',
      captchaErrorMessage(captcha.reason),
    );
  }

  const { email, password, displayName } = parsed.data;
  const cleanName = displayName && displayName.trim() !== '' ? displayName : null;
  const supabase = createSupabaseForRequest(req, res);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: cleanName ? { display_name: cleanName } : {},
    },
  });

  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return sendOk(res, {
        requiresEmailConfirmation: true,
        email,
        message: 'Mã xác nhận đã được gửi trước đó. Vui lòng kiểm tra hộp thư của bạn.',
      });
    }
    // Slide 29: phản hồi giống nhau cho email mới và đã có (chống enumeration)
    if (
      error.message?.toLowerCase().includes('already registered') ||
      error.code === 'user_already_exists'
    ) {
      return sendOk(res, {
        requiresEmailConfirmation: true,
        email,
        message: 'Mã xác nhận đã được gửi tới email của bạn.',
      });
    }
    return sendBusinessError(res, 'AUTH_ERROR', error.message);
  }

  if (data.user) {
    await prisma.profile.upsert({
      where: { id: data.user.id },
      create: { id: data.user.id, email, displayName: cleanName },
      update: {},
    });
  }

  // Slide 17 & 29: Thành công trả 200 { ok: true }, không có accessToken
  return sendOk(res, {
    requiresEmailConfirmation: true,
    email,
    message: 'Mã xác nhận đã được gửi tới email của bạn.',
  });
}

/** POST /api/auth/verify-otp & POST /api/auth/activate */
async function handleVerifyOtp(req: Request, res: Response) {
  const parsed = VerifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu xác nhận không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const { email, token } = parsed.data;
  const supabase = createSupabaseForRequest(req, res);
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  });

  if (error || !data.user) {
    return sendBusinessError(
      res,
      'INVALID_OTP',
      'Mã xác nhận không hợp lệ hoặc đã hết hạn.',
    );
  }

  const metaName = data.user.user_metadata?.display_name;
  const displayName =
    typeof metaName === 'string' && metaName.trim() !== '' ? metaName.trim() : null;

  await prisma.profile.upsert({
    where: { id: data.user.id },
    create: {
      id: data.user.id,
      email: data.user.email ?? email,
      displayName,
    },
    update: {},
  });

  // Slide 17 & 29: Kích hoạt không trả accessToken; người dùng đăng nhập tại /login
  await supabase.auth.signOut();

  return sendOk(res, {
    verified: true,
    email: data.user.email ?? email,
    message: 'Tài khoản đã được kích hoạt thành công. Vui lòng đăng nhập.',
  });
}

/** POST /api/auth/resend-otp & POST /api/auth/activate/resend */
async function handleResendOtp(req: Request, res: Response) {
  const parsed = ResendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Email không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const { email } = parsed.data;
  const supabase = createSupabaseForRequest(req, res);
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });

  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return sendError(
        res,
        429,
        'RATE_LIMITED',
        'Vui lòng đợi ít nhất 60 giây trước khi gửi lại mã.',
      );
    }
    return sendBusinessError(
      res,
      'AUTH_ERROR',
      error.message || 'Không thể gửi lại mã xác nhận.',
    );
  }

  return sendOk(res, {
    email,
    message: 'Đã gửi lại mã xác nhận tới email của bạn.',
  });
}

/** POST /api/auth/forgot-password & POST /api/auth/forgot */
async function handleForgotPassword(req: Request, res: Response) {
  const parsed = ForgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const redirect = `${emailRedirectOrigin()}/reset-password`;
  const supabase = createSupabaseForRequest(req, res);
  const { error: mailError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: redirect,
  });

  // Keep the response identical for existing/non-existing emails (anti-enumeration),
  // but surface SMTP/configuration failures in server logs for operators.
  if (mailError) {
    const [localPart = '', domain = ''] = parsed.data.email.split('@');
    console.error('[auth] password recovery email failed', {
      email: `${localPart.slice(0, 2)}***@${domain ?? ''}`,
      status: mailError.status,
      code: mailError.code,
      message: mailError.message,
      redirectTo: redirect,
    });
  }

  // Slide 18 & 29: Phản hồi giống nhau cho email có và không có tài khoản
  return sendOk(res, {
    email: parsed.data.email,
    message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến hộp thư của bạn.',
  });
}

/** POST /api/auth/logout */
router.post('/logout', async (req, res) => {
  const supabase = createSupabaseForRequest(req, res);
  await supabase.auth.signOut();
  return sendOk(res, { message: 'Bạn đã đăng xuất.' });
});

interface PasswordRecovery {
  userId: string;
  /** Revokes the refresh tokens created while verifying the recovery proof. */
  revokeSessions: () => Promise<void>;
}

/** Single response for every rejected recovery proof (no detail leaks). */
function invalidResetProof(res: Response) {
  return sendBusinessError(
    res,
    'INVALID_RESET_TOKEN',
    'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
  );
}

type RecoveryVerification = {
  data: { user: { id: string } | null } | null;
  error: unknown;
};

/**
 * Verifies a forgot-password proof using a stateless client, so verifying the
 * link never creates a session cookie. Exactly one proof is accepted; a Bearer
 * access token is not a proof (an AAL1 token from a password-only login would
 * otherwise let an attacker skip MFA).
 */
async function resolvePasswordRecovery(
  req: Request,
  res: Response,
  data: z.infer<typeof ResetPasswordSchema>,
): Promise<PasswordRecovery | null> {
  const code = data.code ?? (typeof req.query.code === 'string' ? req.query.code : undefined);
  const tokenHash =
    data.token_hash ??
    (typeof req.query.token_hash === 'string' ? req.query.token_hash : undefined);
  const token = data.token;
  const email = data.email;
  const otp = data.otp;

  const proofCount = [code, tokenHash, token, email && otp ? 'otp' : undefined].filter(
    Boolean,
  ).length;
  if (proofCount === 0) {
    invalidResetProof(res);
    return null;
  }
  if (proofCount > 1) {
    invalidResetProof(res);
    return null;
  }

  const supabase = createStatelessClient();
  let verified: RecoveryVerification;
  if (tokenHash) {
    verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  } else if (email && otp) {
    verified = await supabase.auth.verifyOtp({ email, token: otp, type: 'recovery' });
  } else if (code) {
    verified = await supabase.auth.exchangeCodeForSession(code);
  } else {
    // Older templates put the recovery token in `token`: accept a token hash or
    // an auth code, but never a bare access token.
    verified = await supabase.auth.verifyOtp({ token_hash: token!, type: 'recovery' });
    if (verified.error) {
      verified = await supabase.auth.exchangeCodeForSession(token!);
    }
  }

  if (verified.error || !verified.data?.user) {
    invalidResetProof(res);
    return null;
  }

  return {
    userId: verified.data.user.id,
    revokeSessions: async () => {
      await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
    },
  };
}

/**
 * Persists the new password and revokes old sessions. `keepCurrentSession` is
 * true for a signed-in self-service change (only other devices are signed out);
 * recovery links sign out every device and never leave a session cookie.
 */
async function applyPasswordChange(
  req: Request,
  res: Response,
  userId: string,
  newPassword: string,
  keepCurrentSession: boolean,
  revokeSessions?: () => Promise<void>,
) {
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateError) {
    return sendBusinessError(
      res,
      'AUTH_ERROR',
      'Không thể cập nhật mật khẩu. Vui lòng thử lại.',
    );
  }

  // Slide 22 & 29: Invalidate previously issued JWTs immediately
  recordPasswordReset(userId);

  if (keepCurrentSession) {
    try {
      await createSupabaseForRequest(req, res).auth.signOut({ scope: 'others' });
    } catch {
      // Best-effort: recordPasswordReset already blocks pre-reset access tokens.
    }
  } else {
    try {
      await revokeSessions?.();
    } catch {
      // Best-effort: recordPasswordReset already blocks pre-reset access tokens.
    }
    // Defensive: a recovery link must not leave any auth cookie behind.
    clearSupabaseAuthCookies(req, res);
  }

  // Slide 18 & 29: Reset không trả accessToken và không tự đăng nhập
  return sendOk(res, { message: 'Đổi mật khẩu thành công.' });
}

/** POST /api/auth/reset-password & POST /api/auth/reset */
async function handleResetPassword(req: Request, res: Response) {
  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const newPassword = parsed.data.password;

  // A recovery proof always wins (and is verified below with a stateless
  // client). It lets a signed-in user finish a password reset from the email
  // link, while a dummy token cannot skip the current-password check.
  const hasProof = Boolean(
    parsed.data.code ||
      parsed.data.token_hash ||
      parsed.data.token ||
      (parsed.data.email && parsed.data.otp) ||
      typeof req.query.code === 'string' ||
      typeof req.query.token_hash === 'string',
  );

  if (hasProof) {
    const recovery = await resolvePasswordRecovery(req, res, parsed.data);
    if (!recovery) return;

    return applyPasswordChange(
      req,
      res,
      recovery.userId,
      newPassword,
      false,
      recovery.revokeSessions,
    );
  }

  // An MFA-pending session (AAL1) must never change the password: a stolen
  // password alone would otherwise become a permanent account takeover.
  if (req.mfaRequired) {
    return sendError(res, 401, 'MFA_REQUIRED', 'Vui lòng xác thực hai lớp để tiếp tục.');
  }

  // Signed-in user changing their own password: always re-check the current
  // password. This path deliberately ignores any token fields (see hasProof).
  if (req.user) {
    const currentPassword = parsed.data.currentPassword;
    if (!currentPassword) {
      return sendBusinessError(
        res,
        'CURRENT_PASSWORD_REQUIRED',
        'Vui lòng nhập mật khẩu hiện tại.',
      );
    }

    const passwordCheck = createStatelessClient();
    const { error: passwordError } = await passwordCheck.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword,
    });
    if (passwordError) {
      return sendBusinessError(
        res,
        'INVALID_CURRENT_PASSWORD',
        'Mật khẩu hiện tại không đúng.',
      );
    }
    await passwordCheck.auth.signOut({ scope: 'local' });

    return applyPasswordChange(req, res, req.user.id, newPassword, true);
  }

  invalidResetProof(res);
  return;
}

/** Email confirmation / magic-link landing */
async function handleAuthCallback(req: Request, res: Response) {
  const supabase = createSupabaseForRequest(req, res);
  const code =
    typeof req.query.code === 'string'
      ? req.query.code
      : typeof req.body?.code === 'string'
        ? req.body.code
        : null;
  const tokenHash =
    typeof req.query.token_hash === 'string'
      ? req.query.token_hash
      : typeof req.body?.token_hash === 'string'
        ? req.body.token_hash
        : null;
  const type =
    typeof req.query.type === 'string'
      ? (req.query.type as EmailOtpType)
      : typeof req.body?.type === 'string'
        ? (req.body.type as EmailOtpType)
        : null;
  const email =
    typeof req.query.email === 'string'
      ? req.query.email
      : typeof req.body?.email === 'string'
        ? req.body.email
        : null;
  const otp =
    typeof req.query.otp === 'string'
      ? req.query.otp
      : typeof req.body?.otp === 'string'
        ? req.body.otp
        : null;
  const next = req.query.next ?? req.body?.next;

  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : email && otp && type
        ? await supabase.auth.verifyOtp({ email, token: otp, type })
        : { data: { user: null }, error: new Error('Missing confirmation code') };

  if (error || !data.user) {
    return sendBusinessError(
      res,
      'INVALID_RESET_TOKEN',
      'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.',
    );
  }

  const existingProfile = await prisma.profile.findUnique({ where: { id: data.user.id } });
  if (existingProfile?.status === ProfileStatus.SUSPENDED) {
    await supabase.auth.signOut();
    return sendError(res, 403, 'ACCOUNT_SUSPENDED', ACCOUNT_SUSPENDED_MESSAGE);
  }

  const redirectTo = await landingFor(data.user.id, data.user.email ?? '', next);

  if (data.session?.access_token) {
    const { data: userData, error: userError } = await supabase.auth.getUser(
      data.session.access_token,
    );
    if (userError || !userData.user) {
      return sendError(
        res,
        500,
        'MFA_CHECK_FAILED',
        'Không thể kiểm tra xác thực hai lớp. Vui lòng thử lại.',
      );
    }

    if (hasVerifiedMfa(userData.user)) {
      const challenge = await prepareMfaChallenge(userData.user, data.session, redirectTo);
      if ('lockedUntil' in challenge) {
        return sendMfaLocked(res, challenge.lockedUntil);
      }

      // The challenge holds the session server-side; never leave AAL1 cookies.
      await supabase.auth.signOut({ scope: 'local' });
      clearSupabaseAuthCookies(req, res);

      return sendOk(res, {
        mfaRequired: true,
        ...challenge,
        message: 'Vui lòng nhập mã xác thực hai lớp.',
      });
    }

    await prisma.mfaState.deleteMany({ where: { userId: data.user.id } });
  }

  const profile =
    existingProfile ?? (await prisma.profile.findUnique({ where: { id: data.user.id } }));

  return sendOk(res, {
    user: withMfa(profile, false),
    token: data.session?.access_token,
    accessToken: data.session?.access_token,
    session: data.session,
    redirectTo,
    message: 'Xác nhận thành công.',
  });
}

/**
 * DELETE /api/auth/me
 * Permanently deletes the authenticated user's account after verifying email confirmation.
 * Order: lock active ADMIN rows in transaction, delete Supabase Auth user first so an
 * upstream failure keeps the Profile intact, then remove Profile idempotently via deleteMany,
 * revoke existing JWTs, and sign out cookies.
 */
async function handleDeleteAccount(req: Request, res: Response) {
  const user = req.user;
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  const parsed = DeleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  if (normalizeEmail(parsed.data.email) !== normalizeEmail(user.email)) {
    return sendBusinessError(
      res,
      'EMAIL_MISMATCH',
      'Email xác nhận không khớp với tài khoản hiện tại.',
      { email: 'Email xác nhận không khớp với tài khoản hiện tại.' },
    );
  }

  const outcome = await prisma.$transaction(async (tx) => {
    if (user.role === Role.ADMIN) {
      const otherExists = await hasOtherActiveAdmin(tx, user.id);
      if (!otherExists) {
        return 'LAST_ADMIN' as const;
      }
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteAuthError) {
      return 'AUTH_ERROR' as const;
    }

    await tx.profile.deleteMany({ where: { id: user.id } });
    return 'OK' as const;
  });

  if (outcome === 'LAST_ADMIN') {
    return sendBusinessError(
      res,
      'LAST_ADMIN',
      'Không thể xóa tài khoản quản trị viên cuối cùng.',
    );
  }
  if (outcome === 'AUTH_ERROR') {
    return sendError(res, 500, 'AUTH_ERROR', 'Không thể xóa tài khoản. Vui lòng thử lại sau.');
  }

  recordPasswordReset(user.id);

  const supabase = createSupabaseForRequest(req, res);
  await supabase.auth.signOut();

  return sendOk(res, { message: 'Tài khoản đã được xóa.' });
}

/** GET /api/auth/mfa/status — MFA mirror + recovery-code count. */
async function handleMfaStatus(req: Request, res: Response) {
  const user = req.user;
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  const [state, recoveryCodesRemaining] = await Promise.all([
    getMfaState(user.id),
    prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } }),
  ]);

  return sendOk(res, {
    enabled: Boolean(state?.enabledAt),
    enabledAt: state?.enabledAt ?? null,
    factorId: state?.factorId ?? null,
    recoveryCodesEnabled: recoveryCodesRemaining > 0,
    recoveryCodesRemaining,
    lockedUntil: state?.lockedUntil ?? null,
  });
}

/** POST /api/auth/mfa/enroll — start Supabase TOTP enrollment. */
async function handleMfaEnroll(req: Request, res: Response) {
  const user = req.user;
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  const supabase = createSupabaseForRequest(req, res);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return sendBusinessError(
      res,
      'MFA_SESSION_REQUIRED',
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để bật xác thực hai lớp.',
    );
  }

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return sendMfaError(res, listError);

  if ((factors?.totp ?? []).length > 0) {
    return sendBusinessError(res, 'MFA_ALREADY_ENABLED', 'Tài khoản đã bật xác thực hai lớp.');
  }

  // Clean up abandoned unverified factors so they cannot exhaust the
  // Supabase per-user factor limit. The admin API is used because user-level
  // unenroll requires AAL2, which the user does not have yet.
  for (const factor of factors?.all ?? []) {
    // Unverified leftovers count toward the per-user factor limit. Supabase
    // recovery_code factors are not used by this app, so drop them too.
    if (factor.status !== 'verified' || factor.factor_type === 'recovery_code') {
      try {
        await supabaseAdmin.auth.admin.mfa.deleteFactor({
          userId: user.id,
          id: factor.id,
        });
      } catch {
        // Ignore: a failed cleanup must not block enrollment.
      }
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Team13 Restaurant',
    issuer: 'Team13 Restaurant',
  });

  if (error || !data) return sendMfaError(res, error);

  return sendOk(res, {
    factorId: data.id,
    qrCode: data.totp?.qr_code ?? '',
    secret: data.totp?.secret ?? '',
    uri: data.totp?.uri ?? '',
    issuer: 'Team13 Restaurant',
    digits: 6,
    period: 30,
  });
}

/** POST /api/auth/mfa/enroll/verify — confirm the first TOTP code. */
async function handleMfaEnrollVerify(req: Request, res: Response) {
  const user = req.user;
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  const parsed = MfaEnrollVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu xác thực không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const existing = await getMfaState(user.id);
  if (existing?.enabledAt && existing.factorId) {
    return sendBusinessError(res, 'MFA_ALREADY_ENABLED', 'Tài khoản đã bật xác thực hai lớp.');
  }

  const supabase = createSupabaseForRequest(req, res);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return sendBusinessError(
      res,
      'MFA_SESSION_REQUIRED',
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để bật xác thực hai lớp.',
    );
  }

  const { data: aal2Session, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) return sendMfaError(res, error);

  await ensureMfaState(user.id, parsed.data.factorId);

  let recoveryCodes: string[] = [];
  let recoveryCodesEnabled = false;
  let warning: string | undefined;

  try {
    const codes = generateRecoveryCodes();
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await prisma.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({
        userId: user.id,
        codeHash: hashRecoveryCode(code),
      })),
      skipDuplicates: true,
    });
    await prisma.mfaState.update({
      where: { userId: user.id },
      data: { recoveryCodesEnabled: true },
    });
    recoveryCodes = codes;
    recoveryCodesEnabled = true;
  } catch {
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    warning = 'Không thể tạo mã khôi phục. Bạn có thể tạo lại sau trong trang hồ sơ.';
  }

  // Keep the current AAL2 session (the user just proved possession of the
  // authenticator). Revoke only the *other* sessions; their AAL1 access tokens
  // are also rejected by loadUser because mfa_states.enabled_at is now set.
  try {
    await supabase.auth.signOut({ scope: 'others' });
  } catch {
    // Non-fatal: the current AAL2 session and MFA state are already valid.
  }

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });

  return sendOk(res, {
    enabled: true,
    factorId: parsed.data.factorId,
    recoveryCodes,
    recoveryCodesEnabled,
    warning,
    token: aal2Session?.access_token,
    accessToken: aal2Session?.access_token,
    expiresIn: aal2Session?.expires_in ?? 3600,
    session: aal2Session,
    user: withMfa(profile, true),
    reauthRequired: false,
    message: 'Đã bật xác thực hai lớp.',
  });
}

/** POST /api/auth/mfa/verify — finish a login challenge with a TOTP code. */
async function handleMfaVerify(req: Request, res: Response) {
  const parsed = MfaVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu xác thực không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const challenge = getMfaChallenge(parsed.data.challengeId);
  if (!challenge) {
    return sendBusinessError(
      res,
      'MFA_CHALLENGE_EXPIRED',
      'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.',
    );
  }

  const state = await getMfaState(challenge.userId);
  if (isMfaLocked(state?.lockedUntil)) {
    return sendMfaLocked(res, state!.lockedUntil!);
  }

  if (!challenge.factorId) {
    return sendBusinessError(
      res,
      'MFA_NOT_ENABLED',
      'Tài khoản này chỉ có thể đăng nhập bằng mã khôi phục.',
    );
  }

  if (isReplayedMfaCode(state?.lastCodeHash, state?.lastCodeAt, parsed.data.code)) {
    return sendBusinessError(
      res,
      'INVALID_MFA_CODE',
      'Mã này đã được sử dụng. Vui lòng chờ mã mới từ ứng dụng xác thực.',
    );
  }

  const mfa = createStatelessClient();
  const { error: sessionError } = await mfa.auth.setSession({
    access_token: challenge.accessToken,
    refresh_token: challenge.refreshToken,
  });
  if (sessionError) {
    deleteMfaChallenge(challenge.id);
    return sendBusinessError(
      res,
      'MFA_CHALLENGE_EXPIRED',
      'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.',
    );
  }

  const { data, error } = await mfa.auth.mfa.challengeAndVerify({
    factorId: challenge.factorId,
    code: parsed.data.code,
  });

  if (error) {
    registerMfaChallengeFailure(challenge.id);
    const failure = await markMfaFailure(challenge.userId);
    if (failure.locked) {
      return sendMfaLocked(res, failure.lockedUntil!);
    }
    const remaining = Math.max(0, MFA_MAX_ATTEMPTS - failure.failedAttempts);
    return sendMfaError(res, error, { attempts: String(remaining) });
  }

  deleteMfaChallenge(challenge.id);
  await prisma.mfaState.updateMany({
    where: { userId: challenge.userId },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      lastCodeHash: hashMfaCode(parsed.data.code),
      lastCodeAt: new Date(),
    },
  });

  const { error: setSessionError } = await attachSessionCookies(req, res, data);
  if (setSessionError) {
    return sendError(res, 500, 'AUTH_ERROR', 'Không thể tạo phiên đăng nhập. Vui lòng thử lại.');
  }

  const profile = await prisma.profile.findUnique({ where: { id: challenge.userId } });

  return sendOk(res, {
    user: withMfa(profile, true),
    token: data.access_token,
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    session: data,
    redirectTo: challenge.redirectTo,
    message: 'Đăng nhập thành công.',
  });
}

/** POST /api/auth/mfa/verify-recovery — finish a login challenge with a backup code. */
async function handleMfaVerifyRecovery(req: Request, res: Response) {
  const parsed = MfaRecoveryVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu xác thực không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const challenge = getMfaChallenge(parsed.data.challengeId);
  if (!challenge) {
    return sendBusinessError(
      res,
      'MFA_CHALLENGE_EXPIRED',
      'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.',
    );
  }

  const state = await getMfaState(challenge.userId);
  if (isMfaLocked(state?.lockedUntil)) {
    return sendMfaLocked(res, state!.lockedUntil!);
  }

  const normalized = normalizeRecoveryCode(parsed.data.code);
  if (!normalized) {
    return sendBusinessError(res, 'INVALID_RECOVERY_CODE', 'Mã khôi phục không hợp lệ.');
  }

  const codeHash = hashRecoveryCode(normalized);
  const codeRow = await prisma.mfaRecoveryCode.findFirst({
    where: { userId: challenge.userId, codeHash, usedAt: null },
  });

  if (!codeRow) {
    registerMfaChallengeFailure(challenge.id);
    const failure = await markMfaFailure(challenge.userId);
    if (failure.locked) return sendMfaLocked(res, failure.lockedUntil!);
    return sendBusinessError(
      res,
      'INVALID_RECOVERY_CODE',
      'Mã khôi phục không đúng hoặc đã được sử dụng.',
      { attempts: String(Math.max(0, MFA_MAX_ATTEMPTS - failure.failedAttempts)) },
    );
  }

  // Atomic one-time use: two concurrent requests cannot both consume it.
  const consumed = await prisma.mfaRecoveryCode.updateMany({
    where: { id: codeRow.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) {
    return sendBusinessError(
      res,
      'INVALID_RECOVERY_CODE',
      'Mã khôi phục không đúng hoặc đã được sử dụng.',
    );
  }

  // A recovery code proves ownership, then disables MFA. Deleting a verified
  // factor also revokes the held AAL1 session, so the user signs in again.
  const factors = await supabaseAdmin.auth.admin.mfa.listFactors({
    userId: challenge.userId,
  });
  if (factors.error) {
    return sendError(
      res,
      500,
      'MFA_ERROR',
      'Không thể tắt xác thực hai lớp. Vui lòng thử lại.',
    );
  }

  for (const factor of factors.data?.factors ?? []) {
    const removed = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      userId: challenge.userId,
      id: factor.id,
    });
    if (removed.error && removed.error.code !== 'mfa_factor_not_found') {
      return sendError(
        res,
        500,
        'MFA_ERROR',
        'Không thể tắt xác thực hai lớp. Vui lòng thử lại.',
      );
    }
  }

  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: challenge.userId } });
  await prisma.mfaState.deleteMany({ where: { userId: challenge.userId } });
  deleteMfaChallenge(challenge.id);

  // Deleting a verified factor revokes the held AAL1 session, so the user must
  // sign in again with their password (MFA is now off).
  return sendOk(res, {
    recoveryUsed: true,
    reauthRequired: true,
    redirectTo: '/login',
    message:
      'Đã dùng mã khôi phục. Xác thực hai lớp đã tắt; vui lòng đăng nhập lại bằng mật khẩu.',
  });
}

/** POST /api/auth/mfa/disable — password + current TOTP/recovery code. */
async function handleMfaDisable(req: Request, res: Response) {
  const user = req.user;
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  const parsed = MfaDisableSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu xác thực không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const state = await getMfaState(user.id);
  if (!state?.enabledAt || !state.factorId) {
    return sendBusinessError(res, 'MFA_NOT_ENABLED', 'Tài khoản chưa bật xác thực hai lớp.');
  }

  const supabase = createSupabaseForRequest(req, res);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return sendBusinessError(
      res,
      'MFA_SESSION_REQUIRED',
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    );
  }

  const token = getBearerToken(req) ?? sessionData.session.access_token;
  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (aalError) return sendMfaError(res, aalError);
  if (aal?.currentLevel !== 'aal2') {
    return sendBusinessError(
      res,
      'MFA_REQUIRED',
      'Vui lòng xác thực hai lớp trước khi tắt.',
    );
  }

  if (isMfaLocked(state.lockedUntil)) {
    return sendMfaLocked(res, state.lockedUntil!);
  }

  // Re-check the password so an unattended session cannot disable MFA.
  const passwordClient = createStatelessClient();
  const { error: passwordError } = await passwordClient.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  });
  if (passwordError) {
    return sendBusinessError(res, 'INVALID_PASSWORD', 'Mật khẩu không đúng.');
  }
  await passwordClient.auth.signOut({ scope: 'local' });

  if (parsed.data.recoveryCode?.trim()) {
    const codeHash = hashRecoveryCode(parsed.data.recoveryCode);
    const codeRow = await prisma.mfaRecoveryCode.findFirst({
      where: { userId: user.id, codeHash, usedAt: null },
    });
    const consumed = codeRow
      ? await prisma.mfaRecoveryCode.updateMany({
          where: { id: codeRow.id, usedAt: null },
          data: { usedAt: new Date() },
        })
      : null;
    if (!consumed || consumed.count === 0) {
      const failure = await markMfaFailure(user.id);
      if (failure.locked) return sendMfaLocked(res, failure.lockedUntil!);
      return sendBusinessError(
        res,
        'INVALID_RECOVERY_CODE',
        'Mã khôi phục không đúng hoặc đã được sử dụng.',
      );
    }
  } else {
    const code = parsed.data.code!.trim();
    if (isReplayedMfaCode(state.lastCodeHash, state.lastCodeAt, code)) {
      return sendBusinessError(
        res,
        'INVALID_MFA_CODE',
        'Mã này đã được sử dụng. Vui lòng chờ mã mới từ ứng dụng xác thực.',
      );
    }
    const verified = await supabase.auth.mfa.challengeAndVerify({
      factorId: state.factorId,
      code,
    });
    if (verified.error) {
      const failure = await markMfaFailure(user.id);
      if (failure.locked) return sendMfaLocked(res, failure.lockedUntil!);
      return sendMfaError(res, verified.error, {
        attempts: String(Math.max(0, MFA_MAX_ATTEMPTS - failure.failedAttempts)),
      });
    }
  }

  // Remove every factor (TOTP and any legacy Supabase recovery_code) so the
  // account cannot be left in a half-enabled state.
  const factors = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: user.id });
  if (factors.error) {
    return sendError(res, 500, 'MFA_ERROR', 'Không thể tắt xác thực hai lớp. Vui lòng thử lại.');
  }
  for (const factor of factors.data?.factors ?? []) {
    const removed = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      userId: user.id,
      id: factor.id,
    });
    if (removed.error && removed.error.code !== 'mfa_factor_not_found') {
      return sendError(
        res,
        500,
        'MFA_ERROR',
        'Không thể tắt xác thực hai lớp. Vui lòng thử lại.',
      );
    }
  }

  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
  await prisma.mfaState.deleteMany({ where: { userId: user.id } });
  recordPasswordReset(user.id);
  await supabase.auth.signOut({ scope: 'global' });
  clearSupabaseAuthCookies(req, res);

  return sendOk(res, {
    message: 'Đã tắt xác thực hai lớp. Vui lòng đăng nhập lại.',
    reauthRequired: true,
  });
}

/** POST /api/auth/mfa/recovery-codes — rotate backup codes. */
async function handleMfaRecoveryCodes(req: Request, res: Response) {
  const user = req.user;
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  const parsed = MfaRecoveryCodesSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendBusinessError(
      res,
      'VALIDATION_ERROR',
      'Dữ liệu xác thực không hợp lệ',
      toFieldErrors(parsed.error),
    );
  }

  const state = await getMfaState(user.id);
  if (!state?.enabledAt || !state.factorId) {
    return sendBusinessError(res, 'MFA_NOT_ENABLED', 'Tài khoản chưa bật xác thực hai lớp.');
  }

  const supabase = createSupabaseForRequest(req, res);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    return sendBusinessError(
      res,
      'MFA_SESSION_REQUIRED',
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    );
  }

  if (isMfaLocked(state.lockedUntil)) {
    return sendMfaLocked(res, state.lockedUntil!);
  }

  // Rotating backup codes changes the second factor, so re-check the password
  // even though the session is already fully verified.
  const passwordClient = createStatelessClient();
  const { error: passwordError } = await passwordClient.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  });
  if (passwordError) {
    return sendBusinessError(res, 'INVALID_PASSWORD', 'Mật khẩu không đúng.');
  }
  await passwordClient.auth.signOut({ scope: 'local' });

  if (isReplayedMfaCode(state.lastCodeHash, state.lastCodeAt, parsed.data.code)) {
    return sendBusinessError(
      res,
      'INVALID_MFA_CODE',
      'Mã này đã được sử dụng. Vui lòng chờ mã mới từ ứng dụng xác thực.',
    );
  }

  const verified = await supabase.auth.mfa.challengeAndVerify({
    factorId: state.factorId,
    code: parsed.data.code,
  });
  if (verified.error) {
    const failure = await markMfaFailure(user.id);
    if (failure.locked) return sendMfaLocked(res, failure.lockedUntil!);
    return sendMfaError(res, verified.error, {
      attempts: String(Math.max(0, MFA_MAX_ATTEMPTS - failure.failedAttempts)),
    });
  }

  const codes = generateRecoveryCodes();
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
  await prisma.mfaRecoveryCode.createMany({
    data: codes.map((code) => ({
      userId: user.id,
      codeHash: hashRecoveryCode(code),
    })),
    skipDuplicates: true,
  });
  await prisma.mfaState.update({
    where: { userId: user.id },
    data: {
      recoveryCodesEnabled: true,
      failedAttempts: 0,
      lockedUntil: null,
      lastCodeHash: hashMfaCode(parsed.data.code),
      lastCodeAt: new Date(),
    },
  });

  return sendOk(res, {
    codes,
    message: 'Đã tạo bộ mã khôi phục mới. Hãy lưu lại ngay.',
  });
}

// Routes and Aliases conforming to Deck (Slide 15, 16, 17, 18, 28, 29)
router.delete('/me', authRateLimit(), requireAuth, handleDeleteAccount);

router.get('/mfa/status', requireAuth, handleMfaStatus);
router.post('/mfa/enroll', authRateLimit({ windowMs: 15 * 60_000, max: 10 }), requireAuth, handleMfaEnroll);
router.post(
  '/mfa/enroll/verify',
  authRateLimit({ windowMs: 15 * 60_000, max: 10 }),
  requireAuth,
  handleMfaEnrollVerify,
);
router.post('/mfa/verify', authRateLimit({ windowMs: 15 * 60_000, max: 20 }), handleMfaVerify);
router.post(
  '/mfa/verify-recovery',
  authRateLimit({ windowMs: 15 * 60_000, max: 20 }),
  handleMfaVerifyRecovery,
);
router.post('/mfa/disable', authRateLimit({ windowMs: 15 * 60_000, max: 10 }), requireAuth, handleMfaDisable);
router.post(
  '/mfa/recovery-codes',
  authRateLimit({ windowMs: 15 * 60_000, max: 10 }),
  requireAuth,
  handleMfaRecoveryCodes,
);

router.post('/login', authRateLimit(), handleLogin);
router.post('/register', authRateLimit(), handleRegister);

router.post('/verify-otp', otpRateLimit(), handleVerifyOtp);
router.post('/activate', otpRateLimit(), handleVerifyOtp);

router.post('/resend-otp', otpRateLimit(), handleResendOtp);
router.post('/activate/resend', otpRateLimit(), handleResendOtp);

router.post('/forgot-password', authRateLimit(), handleForgotPassword);
router.post('/forgot', authRateLimit(), handleForgotPassword);

router.post('/reset-password', authRateLimit(), handleResetPassword);
router.post('/reset', authRateLimit(), handleResetPassword);

router.get('/callback', handleAuthCallback);
router.post('/callback', authRateLimit(), handleAuthCallback);

export default router;
