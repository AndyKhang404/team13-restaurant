import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOGIN_POLICY,
  clearLoginAttempts,
  getLoginAttemptState,
  isCaptchaRequired,
  isLocked,
  registerFailedLogin,
  resetLoginAttempts,
} from '../src/auth/login-attempts.js';

describe('login attempt policy', () => {
  beforeEach(() => resetLoginAttempts());

  it('requires CAPTCHA from the third failed attempt onward', () => {
    const email = 'a@b.com';
    expect(isCaptchaRequired(getLoginAttemptState(email))).toBe(false);

    registerFailedLogin(email);
    registerFailedLogin(email);
    expect(isCaptchaRequired(getLoginAttemptState(email))).toBe(false);

    const third = registerFailedLogin(email);
    expect(third.failures).toBe(LOGIN_POLICY.captchaThreshold);
    expect(isCaptchaRequired(third)).toBe(true);
  });

  it('keys the counter by normalized email, not by cookie/session', () => {
    registerFailedLogin('A@B.com ');
    registerFailedLogin('a@b.com');
    registerFailedLogin('a@b.com');

    expect(getLoginAttemptState('a@b.com').failures).toBe(3);
    expect(getLoginAttemptState(' A@B.COM').failures).toBe(3);
  });

  it('does not clear the counter when only the CAPTCHA succeeds', () => {
    registerFailedLogin('a@b.com');
    registerFailedLogin('a@b.com');
    registerFailedLogin('a@b.com');

    // A successful CAPTCHA has no side effect on this module; only a
    // successful password login calls clearLoginAttempts().
    expect(getLoginAttemptState('a@b.com').failures).toBe(3);
    expect(isCaptchaRequired(getLoginAttemptState('a@b.com'))).toBe(true);
  });

  it('locks for five minutes after ten failures', () => {
    const email = 'a@b.com';
    const now = 1_000_000;
    for (let i = 0; i < LOGIN_POLICY.lockThreshold; i += 1) {
      registerFailedLogin(email, now);
    }

    const locked = getLoginAttemptState(email, now + 1);
    expect(locked.failures).toBe(LOGIN_POLICY.lockThreshold);
    expect(isLocked(locked, now + 1)).toBe(true);
    expect(isLocked(locked, now + LOGIN_POLICY.lockMs + 1)).toBe(false);
    expect(getLoginAttemptState(email, now + LOGIN_POLICY.lockMs + 1).failures).toBe(0);
  });

  it('resets the failure window after fifteen minutes', () => {
    const email = 'a@b.com';
    const now = 2_000_000;
    registerFailedLogin(email, now);
    registerFailedLogin(email, now + 1);
    expect(getLoginAttemptState(email, now + 2).failures).toBe(2);

    expect(getLoginAttemptState(email, now + LOGIN_POLICY.windowMs + 1).failures).toBe(0);
  });

  it('clears the email counter on successful login', () => {
    registerFailedLogin('a@b.com');
    registerFailedLogin('a@b.com');
    clearLoginAttempts(' A@B.COM ');

    expect(getLoginAttemptState('a@b.com').failures).toBe(0);
  });
});
