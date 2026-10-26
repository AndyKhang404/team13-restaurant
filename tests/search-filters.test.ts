import { describe, it, expect } from 'vitest';
import { HttpError } from '../src/lib/http.js';
import {
  stripAccents,
  buildTsQuery,
  splitCommaList,
  parseDishListQuery,
  buildDishWhere,
  buildDishOrderBy,
  parseChefListQuery,
  buildChefWhere,
  buildChefOrderBy,
  parseIngredientListQuery,
  buildIngredientWhere,
  buildIngredientOrderBy,
  parseProfileListQuery,
  buildProfileWhere,
  orderIdsByFtsRank,
  sortEntitiesByIds,
} from '../src/lib/search.js';

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';

function expectValidationError(fn: () => unknown, expectedField: string) {
  try {
    fn();
    expect.fail(`Expected VALIDATION_FAILED on field "${expectedField}"`);
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    const httpErr = err as HttpError;
    expect(httpErr.status).toBe(400);
    expect(httpErr.code).toBe('VALIDATION_FAILED');
    expect(httpErr.fields).toBeDefined();
    expect(httpErr.fields?.[expectedField]).toBeTruthy();
  }
}

describe('stripAccents and buildTsQuery', () => {
  it('folds Vietnamese diacritics and đ/Đ into plain ASCII tokens with prefix matching', () => {
    expect(stripAccents('Phở Bò Đặc Biệt')).toBe('Pho Bo Dac Biet');
    expect(buildTsQuery('Phở Bò Đặc Biệt!')).toBe('pho:* & bo:* & dac:* & biet:*');
  });

  it('deduplicates repeated tokens and returns null for empty/punctuation-only input', () => {
    expect(buildTsQuery('bo bo   BÒ')).toBe('bo:*');
    expect(buildTsQuery('   ... !!!   ')).toBeNull();
  });

  it('splits comma-separated values and ignores blanks', () => {
    expect(splitCommaList('main, dessert , ,drink')).toEqual(['main', 'dessert', 'drink']);
    expect(splitCommaList('   ')).toBeUndefined();
    expect(splitCommaList(undefined)).toBeUndefined();
  });
});

describe('Dish query parser & builders', () => {
  it('parses valid multi-value filters, ranges, booleans, and ignores unknown keys', () => {
    const parsed = parseDishListQuery({
      q: '  phở bò  ',
      category: 'main,appetizer',
      minPrice: '25000',
      maxPrice: '150000',
      chefId: `${UUID_1},${UUID_2}`,
      withIngredients: UUID_1,
      withoutIngredients: UUID_2,
      available: 'true',
      featured: 'false',
      maxPrepTime: '30',
      unassignedChef: 'false',
      sort: 'price-asc',
      page: '2',
      unknownParam: 'should-be-ignored',
    });

    expect(parsed.q).toBe('phở bò');
    expect(parsed.categories).toEqual(['main', 'appetizer']);
    expect(parsed.minPrice).toBe(25000);
    expect(parsed.maxPrice).toBe(150000);
    expect(parsed.chefIds).toEqual([UUID_1, UUID_2]);
    expect(parsed.withIngredients).toEqual([UUID_1]);
    expect(parsed.withoutIngredients).toEqual([UUID_2]);
    expect(parsed.available).toBe(true);
    expect(parsed.featured).toBe(false);
    expect(parsed.maxPrepTime).toBe(30);
    expect(parsed.unassignedChef).toBe(false);
    expect(parsed.sort).toBe('price-asc');
    expect(parsed.effectiveSort).toBe('price-asc');
    expect(parsed.page).toBe(2);
  });

  it('defaults effectiveSort to relevance when q is set and sort is omitted', () => {
    const withQ = parseDishListQuery({ q: 'bún chả' });
    expect(withQ.effectiveSort).toBe('relevance');

    const withoutQ = parseDishListQuery({});
    expect(withoutQ.effectiveSort).toBe('');
  });

  it('throws 400 VALIDATION_FAILED with field errors for invalid values', () => {
    expectValidationError(() => parseDishListQuery({ category: 'main,invalid_cat' }), 'category');
    expectValidationError(() => parseDishListQuery({ minPrice: '-10' }), 'minPrice');
    expectValidationError(
      () => parseDishListQuery({ minPrice: '100000', maxPrice: '50000' }),
      'minPrice',
    );
    expectValidationError(() => parseDishListQuery({ chefId: 'not-a-uuid' }), 'chefId');
    expectValidationError(
      () => parseDishListQuery({ withIngredients: 'bad-uuid' }),
      'withIngredients',
    );
    expectValidationError(() => parseDishListQuery({ available: 'yes' }), 'available');
    expectValidationError(() => parseDishListQuery({ maxPrepTime: '0' }), 'maxPrepTime');
    expectValidationError(() => parseDishListQuery({ sort: 'bad-sort' }), 'sort');
    expectValidationError(() => parseDishListQuery({ page: '0' }), 'page');
  });

  it('builds Prisma DishWhereInput and OrderBy accurately', () => {
    const parsed = parseDishListQuery({
      category: 'main,dessert',
      minPrice: '30000',
      maxPrice: '90000',
      withIngredients: UUID_1,
      withoutIngredients: UUID_2,
      available: 'true',
      maxPrepTime: '20',
      unassignedChef: 'true',
      sort: 'prep-asc',
    });

    const where = buildDishWhere(parsed, { hasStaffPerm: true, ftsIds: [UUID_1] });
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { id: { in: [UUID_1] } },
        { category: { in: ['main', 'dessert'] } },
        { price: { gte: 30000, lte: 90000 } },
        { chefId: null },
        { ingredients: { some: { ingredientId: { in: [UUID_1] } } } },
        { ingredients: { none: { ingredientId: { in: [UUID_2] } } } },
        { isAvailable: true },
        { prepTimeMinutes: { lte: 20 } },
      ],
    });

    expect(buildDishOrderBy('prep-asc')).toEqual([
      { prepTimeMinutes: { sort: 'asc', nulls: 'last' } },
      { name: 'asc' },
    ]);
    expect(buildDishOrderBy('ingredients-desc')).toEqual([
      { ingredients: { _count: 'desc' } },
      { name: 'asc' },
    ]);
    expect(buildDishOrderBy('')).toEqual([{ isAvailable: 'desc' }, { name: 'asc' }]);
  });
});

describe('Chef query parser & builders', () => {
  it('parses valid chef filters and sorts', () => {
    const parsed = parseChefListQuery({
      q: 'Gordon',
      isActive: 'true',
      specialty: 'Món Âu, Sushi',
      minExperience: '5',
      hasActiveDishes: 'true',
      sort: 'dishes-desc',
      extraIgnored: '1',
    });

    expect(parsed.isActive).toBe(true);
    expect(parsed.specialties).toEqual(['Món Âu', 'Sushi']);
    expect(parsed.minExperience).toBe(5);
    expect(parsed.hasActiveDishes).toBe(true);
    expect(parsed.effectiveSort).toBe('dishes-desc');

    const where = buildChefWhere(parsed);
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { isActive: true },
        {
          OR: [
            { specialty: { equals: 'Món Âu', mode: 'insensitive' } },
            { specialty: { equals: 'Sushi', mode: 'insensitive' } },
          ],
        },
        { experienceYears: { gte: 5 } },
        { dishes: { some: { isAvailable: true, deletedAt: null } } },
      ],
    });

    expect(buildChefOrderBy('dishes-desc')).toEqual([
      { dishes: { _count: 'desc' } },
      { name: 'asc' },
    ]);
  });

  it('rejects invalid chef filter/sort params with 400 VALIDATION_FAILED', () => {
    expectValidationError(() => parseChefListQuery({ isActive: '1' }), 'isActive');
    expectValidationError(() => parseChefListQuery({ minExperience: '-3' }), 'minExperience');
    expectValidationError(() => parseChefListQuery({ sort: 'invalid' }), 'sort');
  });
});

describe('Ingredient query parser & builders', () => {
  it('parses valid ingredient filters and sorts', () => {
    const parsed = parseIngredientListQuery({
      stock: 'out',
      isAvailable: 'false',
      unit: 'g,kg',
      usage: 'unused',
      sort: 'stock-asc',
    });

    expect(parsed.stock).toBe('out');
    expect(parsed.isAvailable).toBe(false);
    expect(parsed.units).toEqual(['g', 'kg']);
    expect(parsed.usage).toBe('unused');
    expect(parsed.effectiveSort).toBe('stock-asc');

    const where = buildIngredientWhere(parsed);
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { stockQuantity: { lte: 0 } },
        { isAvailable: false },
        {
          OR: [
            { unit: { equals: 'g', mode: 'insensitive' } },
            { unit: { equals: 'kg', mode: 'insensitive' } },
          ],
        },
        { dishes: { none: {} } },
      ],
    });

    expect(buildIngredientOrderBy('usage-desc')).toEqual([
      { dishes: { _count: 'desc' } },
      { name: 'asc' },
    ]);
  });

  it('rejects invalid ingredient filter/sort params with 400 VALIDATION_FAILED', () => {
    expectValidationError(() => parseIngredientListQuery({ stock: 'low' }), 'stock');
    expectValidationError(() => parseIngredientListQuery({ usage: 'all' }), 'usage');
    expectValidationError(() => parseIngredientListQuery({ sort: 'unknown' }), 'sort');
  });
});

describe('Profile query parser & builders', () => {
  it('parses valid role list and date range', () => {
    const parsed = parseProfileListQuery({
      role: 'ADMIN,STAFF',
      createdFrom: '2026-01-01',
      createdTo: '2026-10-26',
      ignoredKey: 'xyz',
    });

    expect(parsed.roles).toEqual(['ADMIN', 'STAFF']);
    expect(parsed.createdFrom?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.createdTo?.toISOString()).toBe('2026-10-26T23:59:59.999Z');

    const where = buildProfileWhere(parsed);
    expect(where).toEqual({
      AND: [
        { role: { in: ['ADMIN', 'STAFF'] } },
        {
          createdAt: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-10-26T23:59:59.999Z'),
          },
        },
      ],
    });
  });

  it('rejects invalid role and inverted date range with 400 VALIDATION_FAILED', () => {
    expectValidationError(() => parseProfileListQuery({ role: 'SUPERUSER' }), 'role');
    expectValidationError(() => parseProfileListQuery({ createdFrom: 'not-a-date' }), 'createdFrom');
    expectValidationError(
      () => parseProfileListQuery({ createdFrom: '2026-10-20', createdTo: '2026-10-01' }),
      'createdFrom',
    );
  });
});

describe('FTS rank ordering helpers', () => {
  it('orders matching IDs and entities by FTS rank order', () => {
    const hits = [
      { id: 'c', rank: 0.9 },
      { id: 'a', rank: 0.5 },
      { id: 'b', rank: 0.2 },
    ];
    const orderedIds = orderIdsByFtsRank(['a', 'b', 'c'], hits);
    expect(orderedIds).toEqual(['c', 'a', 'b']);

    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(sortEntitiesByIds(items, orderedIds)).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  });
});
