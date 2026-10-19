import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Explicit CORS Configuration', () => {
  const app = createApp();

  it('allows requests from default dev origin (http://localhost:5173)', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Origin', 'http://localhost:5173');

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
