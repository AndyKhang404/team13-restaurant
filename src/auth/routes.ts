import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { EmailOtpType } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createSupabaseForRequest } from '../lib/supabase.js';
import { safeNext, sendOk, sendError } from '../lib/http.js';
import { toFieldErrors } from '../lib/validation.js';
import { can } from './permissions.js';
import { authRateLimit } from '../middleware/rate-limit.js';
import { generateCsrfToken } from '../middleware/security.js';

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

router.post('/login', authRateLimit(), async (req, res) => {
  const next = req.body?.next;
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'VALIDATION_ERROR', 'Dữ liệu đăng nhập không hợp lệ', toFieldErrors(parsed.error));
  }

  const supabase = createSupabaseForRequest(req, res);
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.code === 'email_not_confirmed') {
      return sendError(res, 401, 'EMAIL_NOT_CONFIRMED', 'Vui lòng xác nhận địa chỉ email trước.');
    }
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
  }

  const redirectTo = await landingFor(data.user.id, data.user.email ?? parsed.data.email, next);
  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });

  return sendOk(res, {
    user: profile,
    redirectTo,
    message: 'Đăng nhập thành công.',
  });
});

router.post('/register', authRateLimit(), async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'VALIDATION_ERROR', 'Dữ liệu đăng ký không hợp lệ', toFieldErrors(parsed.error));
  }

  const { email, password, displayName } = parsed.data;
  const cleanName = displayName && displayName.trim() !== '' ? displayName : null;
  const supabase = createSupabaseForRequest(req, res);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: cleanName ? { display_name: cleanName } : {},
      emailRedirectTo: `${env.APP_URL}/auth/callback`,
    },
  });

  if (error) {
    return sendError(res, 400, 'AUTH_ERROR', error.message);
  }

  let profile = null;
  if (data.user) {
    profile = await prisma.profile.upsert({
      where: { id: data.user.id },
      create: { id: data.user.id, email, displayName: cleanName },
      update: {},
    });
  }

  if (data.session) {
    const redirectTo = await landingFor(data.user!.id, email, undefined);
    return sendOk(res, {
      requiresEmailConfirmation: false,
      email,
      user: profile,
      redirectTo,
      message: 'Chào mừng! Tài khoản của bạn đã được tạo.',
    });
  }

  return sendOk(res, {
    requiresEmailConfirmation: true,
    email,
    message: 'Vui lòng kiểm tra email để xác nhận tài khoản.',
  });
});

router.post('/logout', async (req, res) => {
  const supabase = createSupabaseForRequest(req, res);
  await supabase.auth.signOut();
  return sendOk(res, { message: 'Bạn đã đăng xuất.' });
});

/** Email confirmation / magic-link landing (PKCE `code` or `token_hash` flow). */
async function handleAuthCallback(req: Request, res: Response) {
  const supabase = createSupabaseForRequest(req, res);
  const code = typeof req.query.code === 'string' ? req.query.code : typeof req.body?.code === 'string' ? req.body.code : null;
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : typeof req.body?.token_hash === 'string' ? req.body.token_hash : null;
  const type = typeof req.query.type === 'string' ? (req.query.type as EmailOtpType) : typeof req.body?.type === 'string' ? (req.body.type as EmailOtpType) : null;
  const next = req.query.next ?? req.body?.next;

  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error('Missing confirmation code') };

  if (error || !data.user) {
    return sendError(res, 400, 'AUTH_ERROR', 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.');
  }

  const redirectTo = await landingFor(data.user.id, data.user.email ?? '', next);
  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });

  return sendOk(res, {
    user: profile,
    redirectTo,
    message: 'Email đã được xác nhận. Chào mừng bạn!',
  });
}

router.get('/callback', handleAuthCallback);
router.post('/callback', handleAuthCallback);

export default router;
