import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { authRateLimit } from '../src/middleware/rate-limit.js';

interface MockResponse {
  statusCode: number;
  body?: unknown;
  status(code: number): MockResponse;
  json: ReturnType<typeof vi.fn>;
}

function mockReqRes(path: string) {
  const req = { ip: '127.0.0.1', path, body: { email: 'a@b.c' } } as unknown as Request;
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
