import { describe, it, expect } from 'vitest';
import { slugify, nextFreeSlug } from '../src/lib/slug.js';

describe('Slug utility', () => {
  it('converts Vietnamese text into a clean URL slug', () => {
    expect(slugify('Phở Bò Tái Lăn')).toBe('pho-bo-tai-lan');
    expect(slugify('Đậu Hũ Chiên Giòn')).toBe('dau-hu-chien-gion');
    expect(slugify('Cá Hồi Nướng & Sốt Bơ Tỏi')).toBe('ca-hoi-nuong-sot-bo-toi');
  });

  it('handles multiple dashes and trims edges', () => {
    expect(slugify('   ---Món Ngon 123---   ')).toBe('mon-ngon-123');
  });

  it('generates next free slug on collisions', () => {
    const existing = ['pho-bo', 'pho-bo-2', 'pho-bo-3'];
    expect(nextFreeSlug('pho-bo', existing)).toBe('pho-bo-4');
    expect(nextFreeSlug('bun-bo', existing)).toBe('bun-bo');
  });
});
