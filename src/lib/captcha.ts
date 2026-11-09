import { env } from '../config/env.js';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const TIMEOUT_MS = 5000;

export type CaptchaFailure = 'missing' | 'invalid' | 'expired' | 'unreachable' | 'misconfigured';

export type CaptchaResult = { ok: true } | { ok: false; reason: CaptchaFailure };

interface SiteVerifyResponse {
  success: boolean;
  hostname?: string;
  'error-codes'?: string[];
}

function allowedHostnames(): Set<string> {
  const host = new URL(env.APP_URL).hostname;
  const allowed = new Set([host]);
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    allowed.add('localhost');
    allowed.add('127.0.0.1');
    allowed.add('::1');
    allowed.add('[::1]');
  }
  return allowed;
}

export async function verifyCaptcha(token: unknown, remoteIp?: string): Promise<CaptchaResult> {
  if (typeof token !== 'string' || token.trim() === '') {
    return { ok: false, reason: 'missing' };
  }

  const body = new URLSearchParams({
    secret: env.CAPTCHA_SECRET_KEY,
    response: token,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  let data: SiteVerifyResponse;
  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: 'unreachable' };
    data = (await response.json()) as SiteVerifyResponse;
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  if (data.success) {
    if (!data.hostname || !allowedHostnames().has(data.hostname)) {
      console.error('[captcha] hostname mismatch or missing:', data.hostname ?? '(missing)');
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
  }

  const codes = data['error-codes'] ?? [];
  if (codes.includes('timeout-or-duplicate')) return { ok: false, reason: 'expired' };
  if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
    console.error('[captcha] reCAPTCHA secret key is invalid; check CAPTCHA_SECRET_KEY.');
    return { ok: false, reason: 'misconfigured' };
  }
  return { ok: false, reason: 'invalid' };
}

export function captchaErrorMessage(reason: CaptchaFailure): string {
  switch (reason) {
    case 'missing':
      return 'Vui lòng xác nhận bạn không phải robot.';
    case 'expired':
      return 'Mã xác thực đã hết hạn hoặc đã được dùng. Vui lòng thử lại.';
    case 'unreachable':
      return 'Không thể xác thực captcha lúc này. Vui lòng thử lại sau.';
    case 'misconfigured':
    case 'invalid':
    default:
      return 'Mã xác thực không hợp lệ. Vui lòng thử lại.';
  }
}
