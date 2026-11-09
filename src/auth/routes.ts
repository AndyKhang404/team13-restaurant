import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { EmailOtpType } from '@supabase/supabase-js';
import { env, isProd } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createSupabaseForRequest, getBearerToken } from '../lib/supabase.js';
import { safeNext, sendOk, sendError, sendBusinessError } from '../lib/http.js';
import { toFieldErrors } from '../lib/validation.js';
import { verifyCaptcha, captchaErrorMessage } from '../lib/captcha.js';
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
    user: req.user,
    csrfToken: csrf,
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

  const supabase = createSupabaseForRequest(req, res);
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
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

  const redirectTo = await landingFor(data.user.id, data.user.email ?? parsed.data.email, next);
  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });

  return sendOk(res, {
    user: profile,
    token: data.session?.access_token,
    accessToken: data.session?.access_token,
    expiresIn: data.session?.expires_in ?? 3600,
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
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: redirect,
  });

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

  const supabase = createSupabaseForRequest(req, res);
  let userId: string | null = req.user?.id ?? null;

  const bearer = getBearerToken(req);
  const code = parsed.data.code ?? (typeof req.query.code === 'string' ? req.query.code : undefined);
  const tokenHash =
    parsed.data.token_hash ??
    (typeof req.query.token_hash === 'string' ? req.query.token_hash : undefined);
  const token = parsed.data.token;
  const email = parsed.data.email;
  const otp = parsed.data.otp;

  // Resolve session if not already logged in
  if (!userId) {
    if (bearer) {
      // Verify Bearer token
      const { data, error } = await supabase.auth.getUser(bearer);
      if (error || !data?.user) {
        return sendBusinessError(
          res,
          'INVALID_RESET_TOKEN',
          'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
        );
      }
      userId = data.user.id;
    } else if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data?.user) {
        return sendBusinessError(
          res,
          'INVALID_RESET_TOKEN',
          'Mã khôi phục không hợp lệ hoặc đã hết hạn.',
        );
      }
      userId = data.user.id;
    } else if (tokenHash) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (error || !data?.user) {
        return sendBusinessError(
          res,
          'INVALID_RESET_TOKEN',
          'Liên kết khôi phục không hợp lệ hoặc đã hết hạn.',
        );
      }
      userId = data.user.id;
    } else if (email && (otp || token)) {
      const codeToVerify = otp ?? token!;
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: codeToVerify,
        type: 'recovery',
      });
      if (error || !data?.user) {
        return sendBusinessError(
          res,
          'INVALID_RESET_TOKEN',
          'Mã xác nhận khôi phục không hợp lệ hoặc đã hết hạn.',
        );
      }
      userId = data.user.id;
    } else if (token) {
      // Generic token passed in body: try token_hash then exchangeCode
      let verifiedUser: string | null = null;
      const resHash = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' });
      if (!resHash.error && resHash.data?.user) {
        verifiedUser = resHash.data.user.id;
      } else {
        const resCode = await supabase.auth.exchangeCodeForSession(token);
        if (!resCode.error && resCode.data?.user) {
          verifiedUser = resCode.data.user.id;
        } else {
          const resUser = await supabase.auth.getUser(token);
          if (!resUser.error && resUser.data?.user) {
            verifiedUser = resUser.data.user.id;
          }
        }
      }
      if (!verifiedUser) {
        return sendBusinessError(
          res,
          'INVALID_RESET_TOKEN',
          'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
        );
      }
      userId = verifiedUser;
    } else {
      return sendBusinessError(
        res,
        'INVALID_RESET_TOKEN',
        'Thiếu token đặt lại mật khẩu.',
      );
    }
  }

  // Update password in Supabase Auth
  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return sendBusinessError(
      res,
      'INVALID_RESET_TOKEN',
      'Không thể cập nhật mật khẩu: ' + updateError.message,
    );
  }

  // Slide 22 & 29: Invalidate previously issued JWTs immediately
  if (userId) {
    recordPasswordReset(userId);
  }
  await supabase.auth.signOut({ scope: 'others' });

  // Slide 18 & 29: Reset không trả accessToken và không tự đăng nhập
  return sendOk(res, { message: 'Đổi mật khẩu thành công.' });
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

  const redirectTo = await landingFor(data.user.id, data.user.email ?? '', next);
  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });

  return sendOk(res, {
    user: profile,
    token: data.session?.access_token,
    accessToken: data.session?.access_token,
    session: data.session,
    redirectTo,
    message: 'Xác nhận thành công.',
  });
}

// Routes and Aliases conforming to Deck (Slide 15, 16, 17, 18, 28, 29)
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
