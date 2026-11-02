import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { describe, it, expect } from 'vitest';
import {
  ADMIN_PAGE_SIZE,
  MENU_PAGE_SIZE,
  pageUrl,
  resolvePage,
  buildPagination,
  skipFor,
  type PageItem,
} from '../src/lib/pagination.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function itemSummary(item: PageItem): string {
  if (item.kind === 'gap') return '…';
  return item.current ? `[${item.number}]` : `${item.number}`;
}

function itemsSummary(items: PageItem[]): string {
  return items.map(itemSummary).join(' ');
}

describe('Pagination Foundation (Task 1)', () => {
  describe('Constants', () => {
    it('defines ADMIN_PAGE_SIZE and MENU_PAGE_SIZE', () => {
      expect(ADMIN_PAGE_SIZE).toBe(10);
      expect(MENU_PAGE_SIZE).toBe(12);
    });
  });

  describe('pageUrl', () => {
    it('matches spec examples', () => {
      expect(pageUrl('/menu', { q: 'pho', category: undefined }, 1)).toBe('/menu?q=pho');
      expect(pageUrl('/menu', { q: 'pho' }, 3)).toBe('/menu?q=pho&page=3');
      expect(pageUrl('/menu', {}, 1)).toBe('/menu');
    });

    it('drops empty filter values (undefined and empty string)', () => {
      expect(pageUrl('/menu', { q: 'pho', category: '', sort: undefined }, 1)).toBe('/menu?q=pho');
      expect(pageUrl('/menu', { q: '', category: '' }, 2)).toBe('/menu?page=2');
      expect(pageUrl('/menu', { q: '', category: '' }, 1)).toBe('/menu');
    });

    it('preserves multiple non-empty filters', () => {
      expect(pageUrl('/menu', { q: 'pho', sort: 'price-asc', category: 'MAIN' }, 4)).toBe(
        '/menu?q=pho&sort=price-asc&category=MAIN&page=4',
      );
    });

    it('omits page parameter on page 1', () => {
      expect(pageUrl('/admin/dishes', { deleted: '1' }, 1)).toBe('/admin/dishes?deleted=1');
      expect(pageUrl('/admin/dishes', { deleted: '1' }, 2)).toBe('/admin/dishes?deleted=1&page=2');
    });

    it('appends with & when basePath already has query parameters', () => {
      expect(pageUrl('/admin/dishes?sort=name', { q: 'pho' }, 2)).toBe(
        '/admin/dishes?sort=name&q=pho&page=2',
      );
    });
  });

  describe('resolvePage', () => {
    // Total: 50, pageSize: 10 => totalPages: 5
    it('handles undefined and empty string by returning page 1 without redirect', () => {
      expect(resolvePage(undefined, 50, 10)).toEqual({ page: 1, redirectPage: null });
      expect(resolvePage('', 50, 10)).toEqual({ page: 1, redirectPage: null });
    });

    it('handles valid page string <= totalPages without redirect (including explicit 1)', () => {
      expect(resolvePage('1', 50, 10)).toEqual({ page: 1, redirectPage: null });
      expect(resolvePage('3', 50, 10)).toEqual({ page: 3, redirectPage: null });
      expect(resolvePage('5', 50, 10)).toEqual({ page: 5, redirectPage: null });
    });

    it('handles valid page string > totalPages by clamping and redirecting to totalPages', () => {
      expect(resolvePage('6', 50, 10)).toEqual({ page: 5, redirectPage: 5 });
      expect(resolvePage('999', 50, 10)).toEqual({ page: 5, redirectPage: 5 });
      // When total is 0, totalPages is 1
      expect(resolvePage('2', 0, 10)).toEqual({ page: 1, redirectPage: 1 });
    });

    it('handles invalid values by returning page 1 and redirecting to page 1', () => {
      expect(resolvePage('abc', 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage('0', 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage('-1', 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage('1.5', 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage(['1', '2'], 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage(null, 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage({}, 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage(' 1 ', 50, 10)).toEqual({ page: 1, redirectPage: 1 });
      expect(resolvePage('01', 50, 10)).toEqual({ page: 1, redirectPage: 1 });
    });
  });

  describe('buildPagination - items window rules', () => {
    // Exact rows from spec table:
    // 1, 1   -> [1]
    // 5, 1   -> [1] 2 … 5
    // 5, 3   -> 1 2 [3] 4 5
    // 7, 4   -> 1 2 3 [4] 5 6 7
    // 12, 3  -> 1 2 [3] 4 … 12
    // 12, 5  -> 1 … 4 [5] 6 … 12
    // 12, 12 -> 1 … 11 [12]

    it('row 1: totalPages=1, current=1 => [1]', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 1,
        total: 10,
        pageSize: 10,
      });
      expect(itemsSummary(p.items)).toBe('[1]');
      expect(p.items).toEqual([{ kind: 'page', number: 1, href: '/menu', current: true }]);
    });

    it('row 2: totalPages=5, current=1 => [1] 2 … 5', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 1,
        total: 50,
        pageSize: 10,
      });
      expect(itemsSummary(p.items)).toBe('[1] 2 … 5');
      expect(p.items).toEqual([
        { kind: 'page', number: 1, href: '/menu', current: true },
        { kind: 'page', number: 2, href: '/menu?page=2', current: false },
        { kind: 'gap' },
        { kind: 'page', number: 5, href: '/menu?page=5', current: false },
      ]);
    });

    it('row 3: totalPages=5, current=3 => 1 2 [3] 4 5', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 3,
        total: 50,
        pageSize: 10,
      });
      expect(itemsSummary(p.items)).toBe('1 2 [3] 4 5');
    });

    it('row 4: totalPages=7, current=4 => 1 2 3 [4] 5 6 7 (1-gap collapse)', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 4,
        total: 70,
        pageSize: 10,
      });
      expect(itemsSummary(p.items)).toBe('1 2 3 [4] 5 6 7');
    });

    it('row 5: totalPages=12, current=3 => 1 2 [3] 4 … 12', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 3,
        total: 120,
        pageSize: 10,
      });
      expect(itemsSummary(p.items)).toBe('1 2 [3] 4 … 12');
    });

    it('row 6: totalPages=12, current=5 => 1 … 4 [5] 6 … 12', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 5,
        total: 120,
        pageSize: 10,
      });
      expect(itemsSummary(p.items)).toBe('1 … 4 [5] 6 … 12');
    });

    it('row 7: totalPages=12, current=12 => 1 … 11 [12]', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 12,
        total: 120,
        pageSize: 10,
      });
      expect(itemsSummary(p.items)).toBe('1 … 11 [12]');
    });
  });

  describe('buildPagination - prev/next and clamping', () => {
    it('sets prevHref and nextHref correctly on page 1 of multiple pages', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: { q: 'pho' },
        page: 1,
        total: 30,
        pageSize: 10,
      });
      expect(p.page).toBe(1);
      expect(p.totalPages).toBe(3);
      expect(p.hasPrev).toBe(false);
      expect(p.prevHref).toBe('');
      expect(p.hasNext).toBe(true);
      expect(p.nextHref).toBe('/menu?q=pho&page=2');
    });

    it('sets prevHref and nextHref correctly on last page', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: { q: 'pho' },
        page: 3,
        total: 30,
        pageSize: 10,
      });
      expect(p.page).toBe(3);
      expect(p.hasPrev).toBe(true);
      expect(p.prevHref).toBe('/menu?q=pho&page=2');
      expect(p.hasNext).toBe(false);
      expect(p.nextHref).toBe('');
    });

    it('omits page parameter in prevHref when previous page is 1', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: { q: 'pho' },
        page: 2,
        total: 30,
        pageSize: 10,
      });
      expect(p.prevHref).toBe('/menu?q=pho');
    });

    it('sets both prevHref and nextHref to empty when totalPages is 1', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 1,
        total: 5,
        pageSize: 10,
      });
      expect(p.totalPages).toBe(1);
      expect(p.hasPrev).toBe(false);
      expect(p.prevHref).toBe('');
      expect(p.hasNext).toBe(false);
      expect(p.nextHref).toBe('');
    });

    it('clamps page when page > totalPages', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: 999,
        total: 30,
        pageSize: 10,
      });
      expect(p.page).toBe(3);
      expect(p.totalPages).toBe(3);
      expect(p.hasNext).toBe(false);
      expect(p.hasPrev).toBe(true);
      expect(p.prevHref).toBe('/menu?page=2');
    });

    it('clamps page when page < 1', () => {
      const p = buildPagination({
        basePath: '/menu',
        filters: {},
        page: -5,
        total: 30,
        pageSize: 10,
      });
      expect(p.page).toBe(1);
      expect(p.hasPrev).toBe(false);
      expect(p.hasNext).toBe(true);
      expect(p.nextHref).toBe('/menu?page=2');
    });
  });

  describe('skipFor', () => {
    it('computes offset correctly with explicit pageSize', () => {
      expect(skipFor(1, 10)).toBe(0);
      expect(skipFor(2, 10)).toBe(10);
      expect(skipFor(3, 12)).toBe(24);
      expect(skipFor(0, 10)).toBe(0);
    });

    it('defaults to ADMIN_PAGE_SIZE (10) when pageSize is omitted', () => {
      expect(skipFor(1)).toBe(0);
      expect(skipFor(2)).toBe(10);
      expect(skipFor(5)).toBe(40);
    });
  });

  describe('pagination.hbs partial rendering', () => {
    const templateSource = fs.readFileSync(
      path.resolve(__dirname, '../src/views/partials/pagination.hbs'),
      'utf8',
    );
    const hbs = Handlebars.create();
    hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    hbs.registerHelper('gt', (a: unknown, b: unknown) => Number(a) > Number(b));
    const render = hbs.compile(templateSource);

    it('renders nothing when totalPages <= 1', () => {
      const pagination = buildPagination({
        basePath: '/admin/dishes',
        filters: {},
        page: 1,
        total: 5,
        pageSize: 10,
      });
      const html = render({ pagination });
      expect(html.trim()).toBe('');
    });

    it('renders admin variant (default) with panel-foot wrapper and summary text', () => {
      const pagination = buildPagination({
        basePath: '/admin/dishes',
        filters: {},
        page: 1,
        total: 50,
        pageSize: 10,
      });
      const html = render({ pagination });
      expect(html).toContain('class="panel-foot"');
      expect(html).toContain('Hiển thị trang 1 / 5 — tổng 50 bản ghi');
      expect(html).toContain('<nav class="pager" aria-label="Phân trang">');
      expect(html).toContain('<span aria-disabled="true">« Trước</span>');
      expect(html).toContain('<span class="num current" aria-current="page">1</span>');
      expect(html).toContain('<a class="num" href="/admin/dishes?page=2">2</a>');
      expect(html).toContain('<span class="gap">…</span>');
      expect(html).toContain('<a class="num" href="/admin/dishes?page=5">5</a>');
      expect(html).toContain('<span class="compact">1 / 5</span>');
      expect(html).toContain('<a href="/admin/dishes?page=2" rel="next">Sau »</a>');
    });

    it('renders public variant without panel-foot wrapper', () => {
      const pagination = buildPagination({
        basePath: '/menu',
        filters: { q: 'pho' },
        page: 2,
        total: 50,
        pageSize: 10,
      });
      const html = render({ pagination, variant: 'public' });
      expect(html).not.toContain('class="panel-foot"');
      expect(html).not.toContain('Hiển thị trang');
      expect(html).toContain('<nav class="pager" aria-label="Phân trang">');
      expect(html).toContain('<a href="/menu?q=pho" rel="prev">« Trước</a>');
      expect(html).toContain('<span class="num current" aria-current="page">2</span>');
      expect(html).toContain('<span class="compact">2 / 5</span>');
      expect(html).toContain('<a href="/menu?q=pho&page=3" rel="next">Sau »</a>');
    });
  });
});
