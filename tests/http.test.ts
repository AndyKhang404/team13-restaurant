import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import {
  safeNext,
  sendOk,
  sendError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  HttpError,
} from '../src/lib/http.js';

describe('HTTP Security Helpers', () => {
  it('allows safe relative redirect paths', () => {
    expect(safeNext('/admin', '/')).toBe('/admin');
    expect(safeNext('/menu?category=main', '/')).toBe('/menu?category=main');
  });

  it('rejects open redirects and falls back safely', () => {
    expect(safeNext('https://evil.com', '/')).toBe('/');
    expect(safeNext('//evil.com', '/')).toBe('/');
    expect(safeNext('/\\evil.com', '/')).toBe('/');
    expect(safeNext(undefined, '/admin')).toBe('/admin');
  });
});

describe('JSON Envelope Helpers', () => {
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

  it('sendOk produces { ok: true, data }', () => {
    const res = mockRes();
    sendOk(res, { foo: 'bar' }, 201);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true, data: { foo: 'bar' } });
  });

  it('sendError produces { ok: false, error: { code, message, fields } }', () => {
    const res = mockRes();
    sendError(res, 400, 'VALIDATION_ERROR', 'Tên không hợp lệ', { name: 'Bắt buộc' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Tên không hợp lệ',
        fields: { name: 'Bắt buộc' },
      },
    });
  });

  it('HttpError instances have code and status', () => {
    expect(badRequest('lỗi', 'VALIDATION_ERROR')).toBeInstanceOf(HttpError);
    expect(unauthorized().code).toBe('UNAUTHORIZED');
    expect(forbidden().status).toBe(403);
    expect(notFound('Món').status).toBe(404);
    expect(conflict('Trùng').status).toBe(409);
  });
});
