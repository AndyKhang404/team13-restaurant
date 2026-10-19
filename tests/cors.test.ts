import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { isAllowedOrigin } from '../src/middleware/cors.js';
import { createApp } from '../src/app.js';

describe('CORS allowed origins', () => {
  it('allows same-origin and non-browser requests (no Origin header)', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin(null)).toBe(true);
    expect(isAllowedOrigin('')).toBe(true);
  });

  it('allows localhost and 127.0.0.1 SPA dev servers', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
  });

  it('rejects unknown external origins', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
    expect(isAllowedOrigin('http://not-localhost.dev:5173')).toBe(false);
  });
});

describe('Explicit CORS configuration', () => {
  const app = createApp();

  it('allows requests from default dev origin (http://localhost:5173)', async () => {
    const res = await request(app).get('/api/auth/me').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows preflight OPTIONS requests with credentials and allowed headers', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-headers']).toMatch(/content-type/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/x-csrf-token/i);
  });

  it('rejects unauthorized origins by omitting access-control-allow-origin', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Origin', 'https://unauthorized-domain.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
