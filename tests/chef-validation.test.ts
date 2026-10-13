import { describe, it, expect } from 'vitest';
import { ChefSchema } from '../src/modules/chefs/routes.js';

const base = {
  name: 'Bếp Test',
  specialty: 'Món Việt',
  bio: 'Tiểu sử',
  experienceYears: '10',
  phone: '0901111111',
};

// Regression: phone accepted any garbage and experience had no upper bound.
describe('ChefSchema', () => {
  it('accepts a valid chef', () => {
    expect(ChefSchema.safeParse(base).success).toBe(true);
  });

  it('accepts the +84 spaced format used in seeds', () => {
    expect(ChefSchema.safeParse({ ...base, phone: '+84 901 111 222' }).success).toBe(true);
  });

  it('treats phone as optional', () => {
    expect(ChefSchema.safeParse({ ...base, phone: '' }).success).toBe(true);
    expect(ChefSchema.safeParse({ ...base, phone: undefined }).success).toBe(true);
  });

  it('rejects garbage phone numbers', () => {
    const r = ChefSchema.safeParse({ ...base, phone: 'abc!!!' });
    expect(r.success).toBe(false);
  });

  it('rejects experience over 100 years, negative or fractional', () => {
    expect(ChefSchema.safeParse({ ...base, experienceYears: '101' }).success).toBe(false);
    expect(ChefSchema.safeParse({ ...base, experienceYears: '-1' }).success).toBe(false);
    expect(ChefSchema.safeParse({ ...base, experienceYears: '2.5' }).success).toBe(false);
  });

  it('reports Vietnamese messages', () => {
    const r = ChefSchema.safeParse({ ...base, name: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toMatch(/bắt buộc/);
    }
  });
});
