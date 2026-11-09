import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
  forbidden,
  isBusinessError,
  sendBusinessError,
  technicalErrorBody,
} from '../src/lib/http.js';

// Deck contract (slides 13, 17, 58):
// - business errors (NOT_FOUND / VALIDATION_FAILED / ALREADY_EXISTS) -> HTTP 200 + { ok:false, error }
// - technical errors (wrong URL 404, crash 500, auth 401/403) -> real status, body WITH { ok:false, error }

interface MockResponse {
  statusCode: number;
  body?: unknown;
  status(code: number): MockResponse;
  json: (body: unknown) => MockResponse;
}

function mockRes() {
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
  return res as unknown as Response & MockResponse;
}

describe('business errors', () => {
  it('marks VALIDATION_FAILED / NOT_FOUND / ALREADY_EXISTS as business', () => {
    expect(badRequest().business).toBe(true);
    expect(badRequest().code).toBe('VALIDATION_FAILED');
    expect(notFound().business).toBe(true);
    expect(notFound().code).toBe('NOT_FOUND');
    expect(conflict().business).toBe(true);
    expect(conflict().code).toBe('ALREADY_EXISTS');
  });

  it('keeps auth errors technical (not business)', () => {
    expect(unauthorized().business).toBe(false);
    expect(forbidden().business).toBe(false);
    expect(isBusinessError(unauthorized())).toBe(false);
    expect(isBusinessError(new Error('boom'))).toBe(false);
    expect(isBusinessError(notFound())).toBe(true);
  });

  it('sendBusinessError returns HTTP 200 with { ok:false, error }', () => {
    const res = mockRes();
    sendBusinessError(res, 'NOT_FOUND', 'Món ăn không tồn tại');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Món ăn không tồn tại' },
    });
  });

  it('sendBusinessError includes fields only when present', () => {
    const res = mockRes();
    sendBusinessError(res, 'VALIDATION_FAILED', 'Sai', { title: 'Bắt buộc' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Sai', fields: { title: 'Bắt buộc' } },
    });
  });
});

describe('technical error body', () => {
  it('includes ok: false and error object', () => {
    const body = technicalErrorBody('NOT_FOUND', 'Endpoint GET /api/bok not found');
    expect(body).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint GET /api/bok not found' },
    });
    expect(body.ok).toBe(false);
  });
});

describe('unknown API route', () => {
  it('returns 404 with ok: false in body', async () => {
    const app = createApp();
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});
