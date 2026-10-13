import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { methodOverride } from '../src/middleware/method-override.js';

function run(body: Record<string, unknown> | undefined, method = 'POST') {
  const req = { body, method } as Request;
  const next = vi.fn();
  methodOverride(req, {} as Response, next);
  return { req, next };
}

// HTML forms can only send GET/POST, so PATCH/DELETE are carried in a
// `_method` body field and rewritten here (after body/multipart parsing).
describe('methodOverride', () => {
  it('rewrites POST + _method=PATCH to PATCH', () => {
    const { req, next } = run({ _method: 'PATCH' });
    expect(req.method).toBe('PATCH');
    expect(next).toHaveBeenCalledOnce();
  });

  it('rewrites POST + _method=DELETE to DELETE', () => {
    const { req } = run({ _method: 'DELETE' });
    expect(req.method).toBe('DELETE');
  });

  it('accepts lowercase _method values', () => {
    const { req } = run({ _method: 'patch' });
    expect(req.method).toBe('PATCH');
  });

  it('ignores GET/POST overrides and missing _method', () => {
    expect(run({ _method: 'GET' }).req.method).toBe('POST');
    expect(run({ _method: 'POST' }).req.method).toBe('POST');
    expect(run({}).req.method).toBe('POST');
    expect(run(undefined).req.method).toBe('POST');
  });

  it('ignores non-string _method values', () => {
    expect(run({ _method: ['PATCH'] }).req.method).toBe('POST');
  });
});
