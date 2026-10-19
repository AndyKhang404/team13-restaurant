import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../src/middleware/cors.js';

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
