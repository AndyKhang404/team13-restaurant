import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { authRateLimit } from '../src/middleware/rate-limit.js';

function mockReqRes(path: string) {
  const req = { ip: '127.0.0.1', path, body: { email: 'a@b.c' } } as unknown as Request;
  const res = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    render: vi.fn(),
  };
  const next = vi.fn();
  return { req, res: res as unknown as Response & { render: ReturnType<typeof vi.fn>; statusCode: number }, next };
}

// The limiter must pass normal traffic and block bursts with a friendly 429
// re-render of the same form (never a crash or silent drop).
describe('authRateLimit', () => {
  it('passes requests under the limit', () => {
    const limit = authRateLimit({ max: 3 });
    const { req, res, next } = mockReqRes('/login');
    limit(req, res, next);
    limit(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.render).not.toHaveBeenCalled();
  });

  it('blocks bursts on /login with a 429 re-render', () => {
    const limit = authRateLimit({ max: 2 });
    const { req, res, next } = mockReqRes('/login');
    limit(req, res, next);
    limit(req, res, next);
    limit(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(429);
    expect(res.render).toHaveBeenCalledWith(
      'pages/auth/login',
      expect.objectContaining({ values: { email: 'a@b.c' } }),
    );
  });

  it('re-renders the register form for /register bursts', () => {
    const limit = authRateLimit({ max: 1 });
    const { req, res, next } = mockReqRes('/register');
    limit(req, res, next);
    limit(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(429);
    expect(res.render).toHaveBeenCalledWith(
      'pages/auth/register',
      expect.objectContaining({ values: expect.objectContaining({ email: 'a@b.c' }) }),
    );
  });
});
