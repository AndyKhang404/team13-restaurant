import { Router } from 'express';
import { z } from 'zod';
import type { EmailOtpType } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createSupabaseForRequest } from '../lib/supabase.js';
import { safeNext } from '../lib/http.js';
import { toFieldErrors } from '../lib/validation.js';
import { can } from './permissions.js';
import { authRateLimit } from '../middleware/rate-limit.js';

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
      .min(8, 'Mật khẩu phải ít nhất 8 ký tự')
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

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next, '/'));
  res.render('pages/auth/login', { title: 'Sign in', next: req.query.next ?? '', values: {} });
});

router.post('/login', authRateLimit(), async (req, res) => {
  const next = req.body?.next;
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).render('pages/auth/login', {
      title: 'Sign in',
      next,
      values: req.body,
      errors: toFieldErrors(parsed.error),
    });
  }
  const supabase = createSupabaseForRequest(req, res);
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return res.status(401).render('pages/auth/login', {
      title: 'Sign in',
      next,
      values: { email: parsed.data.email },
      formError:
        error?.code === 'email_not_confirmed'
          ? 'Please confirm your email address first.'
          : 'Invalid email or password.',
    });
  }
  req.flash('success', 'Signed in successfully.');
  res.redirect(await landingFor(data.user.id, data.user.email ?? parsed.data.email, next));
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('pages/auth/register', { title: 'Create account', values: {} });
});

router.post('/register', authRateLimit(), async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  const values = { displayName: req.body?.displayName, email: req.body?.email };
  if (!parsed.success) {
    return res.status(422).render('pages/auth/register', {
      title: 'Create account',
      values,
      errors: toFieldErrors(parsed.error),
    });
  }
  const { email, password, displayName } = parsed.data;
  // Whitespace-only names become null so profiles never store "".
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
    return res.status(400).render('pages/auth/register', {
      title: 'Create account',
      values,
      formError: error.message,
    });
  }
  if (data.user) {
    await prisma.profile.upsert({
      where: { id: data.user.id },
      create: { id: data.user.id, email, displayName: cleanName },
      update: {},
    });
  }
  if (data.session) {
    // Email confirmation disabled: user is signed in immediately.
    req.flash('success', 'Welcome! Your account has been created.');
    return res.redirect('/');
  }
  res.render('pages/auth/check-email', { title: 'Check your email', email });
});

router.post('/logout', async (req, res) => {
  const supabase = createSupabaseForRequest(req, res);
  await supabase.auth.signOut();
  req.flash('info', 'You have been signed out.');
  res.redirect('/');
});

/** Email confirmation / magic-link landing (PKCE `code` or `token_hash` flow). */
router.get('/auth/callback', async (req, res) => {
  const supabase = createSupabaseForRequest(req, res);
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const tokenHash = typeof req.query.token_hash === 'string' ? req.query.token_hash : null;
  const type = typeof req.query.type === 'string' ? (req.query.type as EmailOtpType) : null;

  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error('Missing confirmation code') };

  if (error || !data.user) {
    req.flash('error', 'That confirmation link is invalid or has expired. Please sign in.');
    return res.redirect('/login');
  }
  req.flash('success', 'Your email is confirmed. Welcome!');
  res.redirect(await landingFor(data.user.id, data.user.email ?? '', req.query.next));
});

export default router;
