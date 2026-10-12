import { describe, it, expect } from 'vitest';
import { safeNext } from '../src/lib/http.js';

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
