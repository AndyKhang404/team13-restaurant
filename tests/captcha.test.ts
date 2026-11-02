import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyCaptcha, captchaErrorMessage } from '../src/lib/captcha.js';

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload };
}

function firstCall() {
  return fetchMock.mock.calls[0] as unknown as [
    string,
    {
      method?: string;
      headers?: Record<string, string>;
      body?: URLSearchParams;
      signal?: unknown;
    },
  ];
}

describe('verifyCaptcha', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects missing tokens without calling Google', async () => {
    await expect(verifyCaptcha(undefined)).resolves.toEqual({ ok: false, reason: 'missing' });
    await expect(verifyCaptcha('   ')).resolves.toEqual({ ok: false, reason: 'missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a successful verification and sends secret/response/ip', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, hostname: 'localhost' }));
    await expect(verifyCaptcha('token-123', '127.0.0.1')).resolves.toEqual({ ok: true });

    const [url, init] = firstCall();
    expect(url).toBe('https://www.google.com/recaptcha/api/siteverify');
    expect(init.method).toBe('POST');
    expect(init.headers?.['content-type']).toBe('application/x-www-form-urlencoded');
    expect(init.body?.get('secret')).toBe('dummy-captcha-secret-key');
    expect(init.body?.get('response')).toBe('token-123');
    expect(init.body?.get('remoteip')).toBe('127.0.0.1');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects a token solved on a different hostname', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse({ success: true, hostname: 'evil.example' }));
    await expect(verifyCaptcha('token')).resolves.toEqual({ ok: false, reason: 'invalid' });
    errorSpy.mockRestore();
  });

  it('rejects a successful response without a hostname', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    await expect(verifyCaptcha('token')).resolves.toEqual({ ok: false, reason: 'invalid' });
    errorSpy.mockRestore();
  });

  it('accepts localhost aliases used during development', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, hostname: '127.0.0.1' }));
    await expect(verifyCaptcha('token')).resolves.toEqual({ ok: true });
  });

  it('maps invalid responses to invalid', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    await expect(verifyCaptcha('bad')).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it('maps duplicate/expired tokens to expired', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    );
    await expect(verifyCaptcha('used')).resolves.toEqual({ ok: false, reason: 'expired' });
  });

  it('maps an invalid secret to misconfigured and logs it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, 'error-codes': ['invalid-input-secret'] }),
    );
    await expect(verifyCaptcha('token')).resolves.toEqual({
      ok: false,
      reason: 'misconfigured',
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('fails closed when Google is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(verifyCaptcha('token')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('fails closed on non-2xx responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(verifyCaptcha('token')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });
});

describe('captchaErrorMessage', () => {
  it('returns a message for every failure reason', () => {
    const reasons = ['missing', 'invalid', 'expired', 'unreachable', 'misconfigured'] as const;
    for (const reason of reasons) {
      expect(captchaErrorMessage(reason).length).toBeGreaterThan(0);
    }
  });
});
