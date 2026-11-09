import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { authRateLimit, otpRateLimit } from '../src/middleware/rate-limit.js';

interface MockResponse {
  statusCode: number;
  body?: unknown;
  status(code: number): MockResponse;
  json: ReturnType<typeof vi.fn>;
}

function mockReqRes(path: string, email = 'a@b.c') {
  const req = { ip: '127.0.0.1', path, body: { email } } as unknown as Request;
  const res: MockResponse = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json: vi.fn().mockImplementation((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  const next = vi.fn();
  return { req, res: res as unknown as Response & MockResponse, next };
}

describe('authRateLimit', () => {
  it('passes requests under the limit', () => {
    const limit = authRateLimit({ max: 3 });
    const { req, res, next } = mockReqRes('/login');
    limit(req, res, next);
    limit(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('blocks bursts with 429 JSON response', () => {
    const limit = authRateLimit({ max: 2 });
    const { req, res, next } = mockReqRes('/login');
    limit(req, res, next);
    limit(req, res, next);
    limit(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'RATE_LIMITED',
          message: expect.stringContaining('Bạn thử quá nhiều lần'),
        }),
      }),
    );
  });
});

describe('otpRateLimit', () => {
  it('allows up to 5 attempts per email in 15 minutes and blocks the 6th', () => {
    const limit = otpRateLimit();
    const { req, res, next } = mockReqRes('/verify-otp', 'User@Example.com ');
    for (let i = 0; i < 5; i++) {
      limit(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(5);
    expect(res.json).not.toHaveBeenCalled();

    // 6th attempt with same email (different casing) is blocked
    const { req: req6, res: res6, next: next6 } = mockReqRes('/verify-otp', 'user@example.com');
    limit(req6, res6, next6);
    expect(next6).not.toHaveBeenCalled();
    expect(res6.statusCode).toBe(429);
    expect(res6.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: 'RATE_LIMITED',
          message: expect.stringContaining('quá 5 lần trong 15 phút'),
        }),
      }),
    );

    // Different email is unaffected
    const { req: reqOther, res: resOther, next: nextOther } = mockReqRes('/verify-otp', 'other@example.com');
    limit(reqOther, resOther, nextOther);
    expect(nextOther).toHaveBeenCalledTimes(1);
    expect(resOther.json).not.toHaveBeenCalled();
  });
});
