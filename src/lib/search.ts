import { DishCategory, Role } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from './prisma.js';
import { badRequest } from './http.js';
import { MAX_PAGE_SIZE, PAGE_SIZE } from './pagination.js';
import { UUID_RE, type FieldErrors } from './validation.js';

const DISH_CATEGORIES = Object.values(DishCategory);
const ROLES = Object.values(Role);

export const DISH_SORT_VALUES = [
  '',
  'relevance',
  'name-asc',
  'name-desc',
  'price-asc',
  'price-desc',
  'newest',
  'updated',
  'prep-asc',
  'ingredients-asc',
  'ingredients-desc',
] as const;
export type DishSort = (typeof DISH_SORT_VALUES)[number];

export const CHEF_SORT_VALUES = [
  '',
  'relevance',
  'experience-asc',
  'experience-desc',
  'dishes-desc',
  'name-asc',
  'newest',
  'updated',
] as const;
export type ChefSort = (typeof CHEF_SORT_VALUES)[number];

export const INGREDIENT_SORT_VALUES = [
  '',
  'relevance',
  'name-asc',
  'stock-asc',
  'stock-desc',
  'price-asc',
  'price-desc',
  'usage-desc',
  'updated',
] as const;
export type IngredientSort = (typeof INGREDIENT_SORT_VALUES)[number];

export const STOCK_FILTER_VALUES = ['in', 'out'] as const;
export type StockFilter = (typeof STOCK_FILTER_VALUES)[number];

export const INGREDIENT_USAGE_VALUES = ['unused', 'activeDishes'] as const;
export type IngredientUsageFilter = (typeof INGREDIENT_USAGE_VALUES)[number];

/** Normalize Vietnamese accents & đ/Đ to plain ASCII lowercase. */
export function stripAccents(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Normalize free-text search string for trigram fuzzy matching:
 * strip Vietnamese diacritics, convert to lowercase, extract alphanumeric tokens.
 */
export function cleanSearchQuery(raw: string): string {
  const normalized = stripAccents(raw).toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+/g);
  if (!tokens || tokens.length === 0) return '';
  return tokens.join(' ');
}

/**
 * Convert a free-text search string into a PostgreSQL prefix tsquery string.
 * Example: "Phở Bò Đặc Biệt!" -> "pho:* & bo:* & dac:* & biet:*"
 * Returns null if the input contains no searchable word tokens.
 */
export function buildTsQuery(raw: string): string | null {
  const normalized = stripAccents(raw).toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+/g);
  if (!tokens || tokens.length === 0) return null;
  const uniqueTokens = Array.from(new Set(tokens));
  return uniqueTokens.map((t) => `${t}:*`).join(' & ');
}

/** Extract a single string from Express query value; empty/whitespace becomes undefined. */
function rawString(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = Array.isArray(val) ? String(val[0] ?? '') : typeof val === 'string' ? val : String(val);
  const trimmed = s.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Split comma-separated query param into non-empty trimmed items. */
export function splitCommaList(val: unknown): string[] | undefined {
  if (val === undefined || val === null) return undefined;
  const raw = Array.isArray(val) ? val.map(String).join(',') : String(val);
  if (raw.trim() === '') return undefined;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function parsePageParam(val: unknown, errors: FieldErrors): number {
  const s = rawString(val);
  if (s === undefined) return 1;
  if (!/^\d+$/.test(s)) {
    errors['page'] = 'Số trang phải là số nguyên dương';
    return 1;
  }
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) {
    errors['page'] = 'Số trang phải ít nhất là 1';
    return 1;
  }
  return n;
}

function parsePageSizeParam(val: unknown, errors: FieldErrors): number {
  const s = rawString(val);
  if (s === undefined) return PAGE_SIZE;
  if (!/^\d+$/.test(s)) {
    errors['pageSize'] = 'Số bản ghi mỗi trang phải là số nguyên dương';
    return PAGE_SIZE;
  }
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1 || n > MAX_PAGE_SIZE) {
    errors['pageSize'] = `Số bản ghi mỗi trang phải từ 1 đến ${MAX_PAGE_SIZE}`;
    return PAGE_SIZE;
  }
  return n;
}

function parseTriBoolean(
  val: unknown,
  key: string,
  label: string,
  errors: FieldErrors,
): boolean | undefined {
  const s = rawString(val);
  if (s === undefined) return undefined;
  const lower = s.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  errors[key] = `${label} phải là "true" hoặc "false"`;
  return undefined;
}

function parseFlagBoolean(val: unknown, key: string, label: string, errors: FieldErrors): boolean {
  const s = rawString(val);
  if (s === undefined) return false;
  const lower = s.toLowerCase();
  if (lower === '1' || lower === 'true') return true;
  if (lower === '0' || lower === 'false') return false;
  errors[key] = `${label} không hợp lệ`;
  return false;
}

function parseNonNegativeNumber(
  val: unknown,
  key: string,
  label: string,
  errors: FieldErrors,
): number | undefined {
  const s = rawString(val);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    errors[key] = `${label} phải là số không âm`;
    return undefined;
  }
  if (n > 9_999_999_999) {
    errors[key] = `${label} quá lớn`;
    return undefined;
  }
  return n;
}

function parsePositiveInt(
  val: unknown,
  key: string,
  label: string,
  errors: FieldErrors,
  min = 1,
  max = 10_000,
): number | undefined {
  const s = rawString(val);
  if (s === undefined) return undefined;
  if (!/^-?\d+$/.test(s)) {
    errors[key] = `${label} phải là số nguyên`;
    return undefined;
  }
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    errors[key] = `${label} phải từ ${min} đến ${max}`;
    return undefined;
  }
  return n;
}

function parseUuidList(
  val: unknown,
  key: string,
  label: string,
  errors: FieldErrors,
): string[] | undefined {
  const list = splitCommaList(val);
  if (!list) return undefined;
  for (const item of list) {
    if (!UUID_RE.test(item)) {
      errors[key] = `${label} chứa ID không hợp lệ`;
      return undefined;
    }
  }
  return Array.from(new Set(list));
}

function parseIsoDate(
  val: unknown,
  key: string,
  label: string,
  endOfDay: boolean,
  errors: FieldErrors,
): Date | undefined {
  const s = rawString(val);
  if (s === undefined) return undefined;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const isoStr = isDateOnly ? `${s}T${endOfDay ? '23:59:59.999Z' : '00:00:00.000Z'}` : s;
  const ms = Date.parse(isoStr);
  if (Number.isNaN(ms)) {
    errors[key] = `${label} không đúng định dạng ngày (YYYY-MM-DD)`;
    return undefined;
  }
  return new Date(ms);
}

// ============================================================
// 1. DISH QUERY PARSER & BUILDERS
// ============================================================

export interface DishListQuery {
  q: string;
  page: number;
  pageSize: number;
  isPageSpecified: boolean;
  all: boolean;
  deleted: boolean;
  categories?: DishCategory[];
  minPrice?: number;
  maxPrice?: number;
  chefIds?: string[];
  withIngredients?: string[];
  withoutIngredients?: string[];
  available?: boolean;
  featured?: boolean;
  maxPrepTime?: number;
  unassignedChef?: boolean;
  sort: DishSort;
  effectiveSort: DishSort;
  filters: Record<string, string | undefined>;
}

export function parseDishListQuery(rawQuery: Record<string, unknown>): DishListQuery {
  const errors: FieldErrors = {};

  const qRaw = rawString(rawQuery['q']);
  const q = qRaw ? qRaw.slice(0, 100) : '';
  const page = parsePageParam(rawQuery['page'], errors);
  const pageSize = parsePageSizeParam(rawQuery['pageSize'], errors);
  const isPageSpecified = rawString(rawQuery['page']) !== undefined;
  const all = parseFlagBoolean(rawQuery['all'], 'all', 'Tham số all', errors);
  const deleted = parseFlagBoolean(rawQuery['deleted'], 'deleted', 'Tham số deleted', errors);

  let categories: DishCategory[] | undefined;
  const catList = splitCommaList(rawQuery['category']);
  if (catList) {
    const invalid = catList.filter((c) => !DISH_CATEGORIES.includes(c as DishCategory));
    if (invalid.length > 0) {
      errors['category'] = 'Danh mục không hợp lệ';
    } else {
      categories = Array.from(new Set(catList as DishCategory[]));
    }
  }

  const minPrice = parseNonNegativeNumber(
    rawQuery['minPrice'],
    'minPrice',
    'Giá tối thiểu',
    errors,
  );
  const maxPrice = parseNonNegativeNumber(rawQuery['maxPrice'], 'maxPrice', 'Giá tối đa', errors);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    errors['minPrice'] = 'Giá tối thiểu không được lớn hơn giá tối đa';
  }

  const chefIds = parseUuidList(rawQuery['chefId'], 'chefId', 'Đầu bếp', errors);
  const withIngredients = parseUuidList(
    rawQuery['withIngredients'],
    'withIngredients',
    'Nguyên liệu bao gồm',
    errors,
  );
  const withoutIngredients = parseUuidList(
    rawQuery['withoutIngredients'],
    'withoutIngredients',
    'Nguyên liệu loại trừ',
    errors,
  );

  const available = parseTriBoolean(rawQuery['available'], 'available', 'Trạng thái bán', errors);
  const featured = parseTriBoolean(rawQuery['featured'], 'featured', 'Món nổi bật', errors);
  const maxPrepTime = parsePositiveInt(
    rawQuery['maxPrepTime'],
    'maxPrepTime',
    'Thời gian chuẩn bị tối đa',
    errors,
    1,
    1440,
  );
  const unassignedChef = parseTriBoolean(
    rawQuery['unassignedChef'],
    'unassignedChef',
    'Chưa gán đầu bếp',
    errors,
  );

  const sortRaw = rawString(rawQuery['sort']) ?? '';
  let sort: DishSort = '';
  if (!DISH_SORT_VALUES.includes(sortRaw as DishSort)) {
    errors['sort'] = 'Tùy chọn sắp xếp không hợp lệ';
  } else {
    sort = sortRaw as DishSort;
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Tham số lọc hoặc sắp xếp món ăn không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  const effectiveSort: DishSort =
    sort === 'relevance' ? (q ? 'relevance' : '') : sort !== '' ? sort : q ? 'relevance' : '';

  const filters: Record<string, string | undefined> = {
    q: q || undefined,
    category: categories?.join(','),
    minPrice: minPrice !== undefined ? String(minPrice) : undefined,
    maxPrice: maxPrice !== undefined ? String(maxPrice) : undefined,
    chefId: chefIds?.join(','),
    withIngredients: withIngredients?.join(','),
    withoutIngredients: withoutIngredients?.join(','),
    available: available !== undefined ? String(available) : undefined,
    featured: featured !== undefined ? String(featured) : undefined,
    maxPrepTime: maxPrepTime !== undefined ? String(maxPrepTime) : undefined,
    unassignedChef: unassignedChef !== undefined ? String(unassignedChef) : undefined,
    deleted: deleted ? '1' : undefined,
    sort: sort || undefined,
    ...(pageSize !== PAGE_SIZE ? { pageSize: String(pageSize) } : {}),
  };

  return {
    q,
    page,
    pageSize,
    isPageSpecified,
    all,
    deleted,
    categories,
    minPrice,
    maxPrice,
    chefIds,
    withIngredients,
    withoutIngredients,
    available,
    featured,
    maxPrepTime,
    unassignedChef,
    sort,
    effectiveSort,
    filters,
  };
}

export function buildDishWhere(
  parsed: DishListQuery,
  options: { hasStaffPerm?: boolean; ftsIds?: string[] } = {},
): Prisma.DishWhereInput {
  const showDeleted = Boolean(parsed.deleted && options.hasStaffPerm);
  const andConditions: Prisma.DishWhereInput[] = [];

  if (!showDeleted) {
    andConditions.push({ deletedAt: null });
  }

  if (options.ftsIds !== undefined) {
    andConditions.push({ id: { in: options.ftsIds } });
  }

  if (parsed.categories && parsed.categories.length > 0) {
    andConditions.push(
      parsed.categories.length === 1
        ? { category: parsed.categories[0] }
        : { category: { in: parsed.categories } },
    );
  }

  if (parsed.minPrice !== undefined || parsed.maxPrice !== undefined) {
    andConditions.push({
      price: {
        ...(parsed.minPrice !== undefined ? { gte: parsed.minPrice } : {}),
        ...(parsed.maxPrice !== undefined ? { lte: parsed.maxPrice } : {}),
      },
    });
  }

  const allowUnassignedFilter =
    Boolean(options.hasStaffPerm) && parsed.unassignedChef !== undefined;
  if (allowUnassignedFilter && parsed.unassignedChef === true) {
    if (parsed.chefIds && parsed.chefIds.length > 0) {
      andConditions.push({
        OR: [{ chefId: null }, { chefId: { in: parsed.chefIds } }],
      });
    } else {
      andConditions.push({ chefId: null });
    }
  } else if (allowUnassignedFilter && parsed.unassignedChef === false) {
    if (parsed.chefIds && parsed.chefIds.length > 0) {
      andConditions.push({ chefId: { in: parsed.chefIds } });
    } else {
      andConditions.push({ chefId: { not: null } });
    }
  } else if (parsed.chefIds && parsed.chefIds.length > 0) {
    andConditions.push(
      parsed.chefIds.length === 1
        ? { chefId: parsed.chefIds[0] }
        : { chefId: { in: parsed.chefIds } },
    );
  }

  if (parsed.withIngredients && parsed.withIngredients.length > 0) {
    andConditions.push({
      ingredients: {
        some: {
          ingredientId: { in: parsed.withIngredients },
        },
      },
    });
  }

  if (parsed.withoutIngredients && parsed.withoutIngredients.length > 0) {
    andConditions.push({
      ingredients: {
        none: {
          ingredientId: { in: parsed.withoutIngredients },
        },
      },
    });
  }

  if (parsed.available !== undefined) {
    andConditions.push({ isAvailable: parsed.available });
  }

  if (parsed.featured !== undefined) {
    andConditions.push({ isFeatured: parsed.featured });
  }

  if (parsed.maxPrepTime !== undefined) {
    andConditions.push({ prepTimeMinutes: { lte: parsed.maxPrepTime } });
  }

  if (andConditions.length === 0) return {};
  if (andConditions.length === 1) return andConditions[0]!;
  return { AND: andConditions };
}

export function buildDishOrderBy(sort: DishSort): Prisma.DishOrderByWithRelationInput[] {
  switch (sort) {
    case 'name-asc':
      return [{ name: 'asc' }];
    case 'name-desc':
      return [{ name: 'desc' }];
    case 'price-asc':
      return [{ price: 'asc' }, { name: 'asc' }];
    case 'price-desc':
      return [{ price: 'desc' }, { name: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'updated':
      return [{ updatedAt: 'desc' }];
    case 'prep-asc':
      return [{ prepTimeMinutes: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }];
    case 'ingredients-asc':
      return [{ ingredients: { _count: 'asc' } }, { name: 'asc' }];
    case 'ingredients-desc':
      return [{ ingredients: { _count: 'desc' } }, { name: 'asc' }];
    case 'relevance':
    case '':
    default:
      return [{ isAvailable: 'desc' }, { name: 'asc' }];
  }
}

// ============================================================
// 2. CHEF QUERY PARSER & BUILDERS
// ============================================================

export interface ChefListQuery {
  q: string;
  page: number;
  pageSize: number;
  isActive?: boolean;
  specialties?: string[];
  minExperience?: number;
  hasActiveDishes?: boolean;
  sort: ChefSort;
  effectiveSort: ChefSort;
  filters: Record<string, string | undefined>;
}

export function parseChefListQuery(rawQuery: Record<string, unknown>): ChefListQuery {
  const errors: FieldErrors = {};

  const qRaw = rawString(rawQuery['q']);
  const q = qRaw ? qRaw.slice(0, 100) : '';
  const page = parsePageParam(rawQuery['page'], errors);
  const pageSize = parsePageSizeParam(rawQuery['pageSize'], errors);
  const isActive = parseTriBoolean(
    rawQuery['isActive'],
    'isActive',
    'Trạng thái hoạt động',
    errors,
  );
  const specialties = splitCommaList(rawQuery['specialty']);
  const minExperience = parsePositiveInt(
    rawQuery['minExperience'],
    'minExperience',
    'Số năm kinh nghiệm tối thiểu',
    errors,
    0,
    100,
  );
  const hasActiveDishes = parseTriBoolean(
    rawQuery['hasActiveDishes'],
    'hasActiveDishes',
    'Có món đang bán',
    errors,
  );

  const sortRaw = rawString(rawQuery['sort']) ?? '';
  let sort: ChefSort = '';
  if (!CHEF_SORT_VALUES.includes(sortRaw as ChefSort)) {
    errors['sort'] = 'Tùy chọn sắp xếp không hợp lệ';
  } else {
    sort = sortRaw as ChefSort;
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Tham số lọc hoặc sắp xếp đầu bếp không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  const effectiveSort: ChefSort =
    sort === 'relevance'
      ? q
        ? 'relevance'
        : 'updated'
      : sort !== ''
        ? sort
        : q
          ? 'relevance'
          : 'updated';

  const filters: Record<string, string | undefined> = {
    q: q || undefined,
    isActive: isActive !== undefined ? String(isActive) : undefined,
    specialty: specialties?.join(','),
    minExperience: minExperience !== undefined ? String(minExperience) : undefined,
    hasActiveDishes: hasActiveDishes !== undefined ? String(hasActiveDishes) : undefined,
    sort: sort || undefined,
    ...(pageSize !== PAGE_SIZE ? { pageSize: String(pageSize) } : {}),
  };

  return {
    q,
    page,
    pageSize,
    isActive,
    specialties,
    minExperience,
    hasActiveDishes,
    sort,
    effectiveSort,
    filters,
  };
}

export function buildChefWhere(
  parsed: ChefListQuery,
  options: { ftsIds?: string[] } = {},
): Prisma.ChefWhereInput {
  const andConditions: Prisma.ChefWhereInput[] = [{ deletedAt: null }];

  if (options.ftsIds !== undefined) {
    andConditions.push({ id: { in: options.ftsIds } });
  }

  if (parsed.isActive !== undefined) {
    andConditions.push({ isActive: parsed.isActive });
  }

  if (parsed.specialties && parsed.specialties.length > 0) {
    andConditions.push({
      OR: parsed.specialties.map((s) => ({
        specialty: { equals: s, mode: 'insensitive' },
      })),
    });
  }

  if (parsed.minExperience !== undefined) {
    andConditions.push({ experienceYears: { gte: parsed.minExperience } });
  }

  if (parsed.hasActiveDishes === true) {
    andConditions.push({
      dishes: {
        some: { isAvailable: true, deletedAt: null },
      },
    });
  } else if (parsed.hasActiveDishes === false) {
    andConditions.push({
      dishes: {
        none: { isAvailable: true, deletedAt: null },
      },
    });
  }

  return andConditions.length === 1 ? andConditions[0]! : { AND: andConditions };
}

export function buildChefOrderBy(sort: ChefSort): Prisma.ChefOrderByWithRelationInput[] {
  switch (sort) {
    case 'experience-asc':
      return [{ experienceYears: 'asc' }, { name: 'asc' }];
    case 'experience-desc':
      return [{ experienceYears: 'desc' }, { name: 'asc' }];
    case 'dishes-desc':
      return [{ dishes: { _count: 'desc' } }, { name: 'asc' }];
    case 'name-asc':
      return [{ name: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'updated':
    case 'relevance':
    case '':
    default:
      return [{ updatedAt: 'desc' }];
  }
}

// ============================================================
// 3. INGREDIENT QUERY PARSER & BUILDERS
// ============================================================

export interface IngredientListQuery {
  q: string;
  page: number;
  pageSize: number;
  stock?: StockFilter;
  isAvailable?: boolean;
  units?: string[];
  usage?: IngredientUsageFilter;
  sort: IngredientSort;
  effectiveSort: IngredientSort;
  filters: Record<string, string | undefined>;
}

export function parseIngredientListQuery(rawQuery: Record<string, unknown>): IngredientListQuery {
  const errors: FieldErrors = {};

  const qRaw = rawString(rawQuery['q']);
  const q = qRaw ? qRaw.slice(0, 100) : '';
  const page = parsePageParam(rawQuery['page'], errors);
  const pageSize = parsePageSizeParam(rawQuery['pageSize'], errors);

  let stock: StockFilter | undefined;
  const stockRaw = rawString(rawQuery['stock']);
  if (stockRaw !== undefined) {
    if (!STOCK_FILTER_VALUES.includes(stockRaw as StockFilter)) {
      errors['stock'] = 'Trạng thái tồn kho phải là "in" hoặc "out"';
    } else {
      stock = stockRaw as StockFilter;
    }
  }

  const isAvailable = parseTriBoolean(
    rawQuery['isAvailable'],
    'isAvailable',
    'Trạng thái sẵn có',
    errors,
  );
  const units = splitCommaList(rawQuery['unit']);

  let usage: IngredientUsageFilter | undefined;
  const usageRaw = rawString(rawQuery['usage']);
  if (usageRaw !== undefined) {
    if (!INGREDIENT_USAGE_VALUES.includes(usageRaw as IngredientUsageFilter)) {
      errors['usage'] = 'Tùy chọn sử dụng phải là "unused" hoặc "activeDishes"';
    } else {
      usage = usageRaw as IngredientUsageFilter;
    }
  }

  const sortRaw = rawString(rawQuery['sort']) ?? '';
  let sort: IngredientSort = '';
  if (!INGREDIENT_SORT_VALUES.includes(sortRaw as IngredientSort)) {
    errors['sort'] = 'Tùy chọn sắp xếp không hợp lệ';
  } else {
    sort = sortRaw as IngredientSort;
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest(
      'Tham số lọc hoặc sắp xếp nguyên liệu không hợp lệ',
      'VALIDATION_FAILED',
      errors,
    );
  }

  const effectiveSort: IngredientSort =
    sort === 'relevance'
      ? q
        ? 'relevance'
        : 'name-asc'
      : sort !== ''
        ? sort
        : q
          ? 'relevance'
          : 'name-asc';

  const filters: Record<string, string | undefined> = {
    q: q || undefined,
    stock,
    isAvailable: isAvailable !== undefined ? String(isAvailable) : undefined,
    unit: units?.join(','),
    usage,
    sort: sort || undefined,
    ...(pageSize !== PAGE_SIZE ? { pageSize: String(pageSize) } : {}),
  };

  return {
    q,
    page,
    pageSize,
    stock,
    isAvailable,
    units,
    usage,
    sort,
    effectiveSort,
    filters,
  };
}

export function buildIngredientWhere(
  parsed: IngredientListQuery,
  options: { ftsIds?: string[] } = {},
): Prisma.IngredientWhereInput {
  const andConditions: Prisma.IngredientWhereInput[] = [{ deletedAt: null }];

  if (options.ftsIds !== undefined) {
    andConditions.push({ id: { in: options.ftsIds } });
  }

  if (parsed.stock === 'in') {
    andConditions.push({ stockQuantity: { gt: 0 } });
  } else if (parsed.stock === 'out') {
    andConditions.push({ stockQuantity: { lte: 0 } });
  }

  if (parsed.isAvailable !== undefined) {
    andConditions.push({ isAvailable: parsed.isAvailable });
  }

  if (parsed.units && parsed.units.length > 0) {
    andConditions.push({
      OR: parsed.units.map((u) => ({
        unit: { equals: u, mode: 'insensitive' },
      })),
    });
  }

  if (parsed.usage === 'unused') {
    andConditions.push({
      dishes: { none: {} },
    });
  } else if (parsed.usage === 'activeDishes') {
    andConditions.push({
      dishes: {
        some: {
          dish: { isAvailable: true, deletedAt: null },
        },
      },
    });
  }

  return andConditions.length === 1 ? andConditions[0]! : { AND: andConditions };
}

export function buildIngredientOrderBy(
  sort: IngredientSort,
): Prisma.IngredientOrderByWithRelationInput[] {
  switch (sort) {
    case 'stock-asc':
      return [{ stockQuantity: 'asc' }, { name: 'asc' }];
    case 'stock-desc':
      return [{ stockQuantity: 'desc' }, { name: 'asc' }];
    case 'price-asc':
      return [{ pricePerUnit: 'asc' }, { name: 'asc' }];
    case 'price-desc':
      return [{ pricePerUnit: 'desc' }, { name: 'asc' }];
    case 'usage-desc':
      return [{ dishes: { _count: 'desc' } }, { name: 'asc' }];
    case 'updated':
      return [{ updatedAt: 'desc' }];
    case 'name-asc':
    case 'relevance':
    case '':
    default:
      return [{ name: 'asc' }];
  }
}

// ============================================================
// 4. PROFILE QUERY PARSER & BUILDERS
// ============================================================

export interface ProfileListQuery {
  q: string;
  page: number;
  pageSize: number;
  roles?: Role[];
  createdFrom?: Date;
  createdTo?: Date;
  filters: Record<string, string | undefined>;
}

export function parseProfileListQuery(rawQuery: Record<string, unknown>): ProfileListQuery {
  const errors: FieldErrors = {};

  const qRaw = rawString(rawQuery['q']);
  const q = qRaw ? qRaw.slice(0, 100) : '';
  const page = parsePageParam(rawQuery['page'], errors);
  const pageSize = parsePageSizeParam(rawQuery['pageSize'], errors);

  let roles: Role[] | undefined;
  const roleList = splitCommaList(rawQuery['role']);
  if (roleList) {
    const invalid = roleList.filter((r) => !ROLES.includes(r as Role));
    if (invalid.length > 0) {
      errors['role'] = 'Vai trò lọc không hợp lệ';
    } else {
      roles = Array.from(new Set(roleList as Role[]));
    }
  }

  const createdFrom = parseIsoDate(
    rawQuery['createdFrom'],
    'createdFrom',
    'Từ ngày',
    false,
    errors,
  );
  const createdTo = parseIsoDate(rawQuery['createdTo'], 'createdTo', 'Đến ngày', true, errors);
  if (createdFrom && createdTo && createdFrom.getTime() > createdTo.getTime()) {
    errors['createdFrom'] = 'Ngày bắt đầu không được sau ngày kết thúc';
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Tham số lọc người dùng không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  const filters: Record<string, string | undefined> = {
    q: q || undefined,
    role: roles?.join(','),
    createdFrom: rawString(rawQuery['createdFrom']),
    createdTo: rawString(rawQuery['createdTo']),
    ...(pageSize !== PAGE_SIZE ? { pageSize: String(pageSize) } : {}),
  };

  return {
    q,
    page,
    pageSize,
    roles,
    createdFrom,
    createdTo,
    filters,
  };
}

export function buildProfileWhere(
  parsed: ProfileListQuery,
  options: { ftsIds?: string[] } = {},
): Prisma.ProfileWhereInput {
  const andConditions: Prisma.ProfileWhereInput[] = [];

  if (options.ftsIds !== undefined) {
    andConditions.push({ id: { in: options.ftsIds } });
  }

  if (parsed.roles && parsed.roles.length > 0) {
    andConditions.push(
      parsed.roles.length === 1 ? { role: parsed.roles[0] } : { role: { in: parsed.roles } },
    );
  }

  if (parsed.createdFrom || parsed.createdTo) {
    andConditions.push({
      createdAt: {
        ...(parsed.createdFrom ? { gte: parsed.createdFrom } : {}),
        ...(parsed.createdTo ? { lte: parsed.createdTo } : {}),
      },
    });
  }

  if (andConditions.length === 0) return {};
  if (andConditions.length === 1) return andConditions[0]!;
  return { AND: andConditions };
}

// ============================================================
// 5. POSTGRES FTS RAW SQL RUNNERS
// ============================================================

export interface FtsHit {
  id: string;
  rank: number;
}

/**
 * Search dishes via Postgres FTS & fuzzy trigram similarity:
 * - dish name (A) + description (B) via `dishes.search_vector`
 * - linked chef name (weight B)
 * - linked ingredient names (via `ingredients.search_vector`, weight C)
 * - trigram similarity and word_similarity for typo tolerance
 */
export async function searchDishesFts(
  q: string,
  options: SearchOptions = {},
): Promise<FtsHit[]> {
  const tsQuery = buildTsQuery(q);
  const cleanQ = cleanSearchQuery(q);
  const enableFuzzy = options.fuzzy !== false && cleanQ.length > 0;

  if (!tsQuery && !enableFuzzy) return [];

  if (!enableFuzzy) {
    if (!tsQuery) return [];
    const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
      WITH q AS (SELECT to_tsquery('simple', ${tsQuery}) AS query)
      SELECT
        d.id,
        (
          ts_rank(d.search_vector, q.query) +
          COALESCE((
            SELECT ts_rank(setweight(to_tsvector('simple', public.f_unaccent(coalesce(c.name, ''))), 'B'), q.query)
            FROM chefs c
            WHERE c.id = d.chef_id AND c.deleted_at IS NULL
          ), 0) +
          COALESCE((
            SELECT MAX(ts_rank(setweight(i.search_vector, 'C'), q.query))
            FROM dish_ingredients di
            JOIN ingredients i ON i.id = di.ingredient_id
            WHERE di.dish_id = d.id AND i.deleted_at IS NULL
          ), 0)
        )::float8 AS rank
      FROM dishes d, q
      WHERE
        d.search_vector @@ q.query
        OR EXISTS (
          SELECT 1 FROM chefs c
          WHERE c.id = d.chef_id
            AND c.deleted_at IS NULL
            AND to_tsvector('simple', public.f_unaccent(coalesce(c.name, ''))) @@ q.query
        )
        OR EXISTS (
          SELECT 1 FROM dish_ingredients di
          JOIN ingredients i ON i.id = di.ingredient_id
          WHERE di.dish_id = d.id
            AND i.deleted_at IS NULL
            AND i.search_vector @@ q.query
        )
      ORDER BY rank DESC, d.name ASC
    `;
    return rows;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
    WITH q_params AS (
      SELECT
        CASE WHEN ${tsQuery}::text IS NOT NULL THEN to_tsquery('simple', ${tsQuery}::text) ELSE NULL END AS fts_query,
        ${cleanQ}::text AS cq
    )
    SELECT
      d.id,
      (
        COALESCE(
          CASE WHEN q_params.fts_query IS NOT NULL THEN (
            ts_rank(d.search_vector, q_params.fts_query) * 2.0 +
            COALESCE((
              SELECT ts_rank(setweight(to_tsvector('simple', public.f_unaccent(coalesce(c.name, ''))), 'B'), q_params.fts_query)
              FROM chefs c
              WHERE c.id = d.chef_id AND c.deleted_at IS NULL
            ), 0) * 2.0 +
            COALESCE((
              SELECT MAX(ts_rank(setweight(i.search_vector, 'C'), q_params.fts_query))
              FROM dish_ingredients di
              JOIN ingredients i ON i.id = di.ingredient_id
              WHERE di.dish_id = d.id AND i.deleted_at IS NULL
            ), 0) * 2.0
          ) ELSE 0 END,
          0
        ) +
        (
          COALESCE(similarity(public.f_unaccent(d.name), q_params.cq) * 2.0, 0) +
          COALESCE(word_similarity(q_params.cq, public.f_unaccent(d.name)) * 1.5, 0) +
          COALESCE(similarity(public.f_unaccent(coalesce(d.description, '')), q_params.cq) * 0.8, 0) +
          COALESCE((
            SELECT MAX(GREATEST(
              similarity(public.f_unaccent(coalesce(c.name, '')), q_params.cq),
              word_similarity(q_params.cq, public.f_unaccent(coalesce(c.name, '')))
            ))
            FROM chefs c
            WHERE c.id = d.chef_id AND c.deleted_at IS NULL
          ), 0) * 1.2 +
          COALESCE((
            SELECT MAX(GREATEST(
              similarity(public.f_unaccent(i.name), q_params.cq),
              word_similarity(q_params.cq, public.f_unaccent(i.name))
            ))
            FROM dish_ingredients di
            JOIN ingredients i ON i.id = di.ingredient_id
            WHERE di.dish_id = d.id AND i.deleted_at IS NULL
          ), 0)
        )
      )::float8 AS rank
    FROM dishes d, q_params
    WHERE
      (
        q_params.fts_query IS NOT NULL AND (
          d.search_vector @@ q_params.fts_query
          OR EXISTS (
            SELECT 1 FROM chefs c
            WHERE c.id = d.chef_id
              AND c.deleted_at IS NULL
              AND to_tsvector('simple', public.f_unaccent(coalesce(c.name, ''))) @@ q_params.fts_query
          )
          OR EXISTS (
            SELECT 1 FROM dish_ingredients di
            JOIN ingredients i ON i.id = di.ingredient_id
            WHERE di.dish_id = d.id
              AND i.deleted_at IS NULL
              AND i.search_vector @@ q_params.fts_query
          )
        )
      )
      OR (
        public.f_unaccent(d.name) % q_params.cq
        OR q_params.cq <% public.f_unaccent(d.name)
        OR public.f_unaccent(coalesce(d.description, '')) % q_params.cq
        OR EXISTS (
          SELECT 1 FROM chefs c
          WHERE c.id = d.chef_id AND c.deleted_at IS NULL
            AND (
              public.f_unaccent(c.name) % q_params.cq
              OR q_params.cq <% public.f_unaccent(c.name)
            )
        )
        OR EXISTS (
          SELECT 1 FROM dish_ingredients di
          JOIN ingredients i ON i.id = di.ingredient_id
          WHERE di.dish_id = d.id AND i.deleted_at IS NULL
            AND (
              public.f_unaccent(i.name) % q_params.cq
              OR q_params.cq <% public.f_unaccent(i.name)
            )
        )
        OR (
          length(q_params.cq) < 3 AND (
            public.f_unaccent(d.name) ILIKE ('%' || q_params.cq || '%')
            OR public.f_unaccent(coalesce(d.description, '')) ILIKE ('%' || q_params.cq || '%')
          )
        )
      )
    ORDER BY rank DESC, d.name ASC
  `;
  return rows;
}

/** Search chefs via Postgres FTS & fuzzy trigram similarity: name (A), specialty (B), bio (C). */
export async function searchChefsFts(
  q: string,
  options: SearchOptions = {},
): Promise<FtsHit[]> {
  const tsQuery = buildTsQuery(q);
  const cleanQ = cleanSearchQuery(q);
  const enableFuzzy = options.fuzzy !== false && cleanQ.length > 0;

  if (!tsQuery && !enableFuzzy) return [];

  if (!enableFuzzy) {
    if (!tsQuery) return [];
    const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
      WITH q AS (SELECT to_tsquery('simple', ${tsQuery}) AS query)
      SELECT
        c.id,
        ts_rank(c.search_vector, q.query)::float8 AS rank
      FROM chefs c, q
      WHERE c.search_vector @@ q.query
      ORDER BY rank DESC, c.name ASC
    `;
    return rows;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
    WITH q_params AS (
      SELECT
        CASE WHEN ${tsQuery}::text IS NOT NULL THEN to_tsquery('simple', ${tsQuery}::text) ELSE NULL END AS fts_query,
        ${cleanQ}::text AS cq
    )
    SELECT
      c.id,
      (
        COALESCE(
          CASE WHEN q_params.fts_query IS NOT NULL THEN ts_rank(c.search_vector, q_params.fts_query) * 2.0 ELSE 0 END,
          0
        ) +
        (
          COALESCE(similarity(public.f_unaccent(c.name), q_params.cq) * 2.0, 0) +
          COALESCE(word_similarity(q_params.cq, public.f_unaccent(c.name)) * 1.5, 0) +
          COALESCE(similarity(public.f_unaccent(coalesce(c.specialty, '')), q_params.cq) * 1.0, 0) +
          COALESCE(similarity(public.f_unaccent(coalesce(c.bio, '')), q_params.cq) * 0.5, 0)
        )
      )::float8 AS rank
    FROM chefs c, q_params
    WHERE
      (q_params.fts_query IS NOT NULL AND c.search_vector @@ q_params.fts_query)
      OR public.f_unaccent(c.name) % q_params.cq
      OR q_params.cq <% public.f_unaccent(c.name)
      OR public.f_unaccent(coalesce(c.specialty, '')) % q_params.cq
      OR (
        length(q_params.cq) < 3 AND (
          public.f_unaccent(c.name) ILIKE ('%' || q_params.cq || '%')
          OR public.f_unaccent(coalesce(c.specialty, '')) ILIKE ('%' || q_params.cq || '%')
        )
      )
    ORDER BY rank DESC, c.name ASC
  `;
  return rows;
}

/** Search ingredients via Postgres FTS & fuzzy trigram similarity: name (A), unit (D). */
export async function searchIngredientsFts(
  q: string,
  options: SearchOptions = {},
): Promise<FtsHit[]> {
  const tsQuery = buildTsQuery(q);
  const cleanQ = cleanSearchQuery(q);
  const enableFuzzy = options.fuzzy !== false && cleanQ.length > 0;

  if (!tsQuery && !enableFuzzy) return [];

  if (!enableFuzzy) {
    if (!tsQuery) return [];
    const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
      WITH q AS (SELECT to_tsquery('simple', ${tsQuery}) AS query)
      SELECT
        i.id,
        ts_rank(i.search_vector, q.query)::float8 AS rank
      FROM ingredients i, q
      WHERE i.search_vector @@ q.query
      ORDER BY rank DESC, i.name ASC
    `;
    return rows;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
    WITH q_params AS (
      SELECT
        CASE WHEN ${tsQuery}::text IS NOT NULL THEN to_tsquery('simple', ${tsQuery}::text) ELSE NULL END AS fts_query,
        ${cleanQ}::text AS cq
    )
    SELECT
      i.id,
      (
        COALESCE(
          CASE WHEN q_params.fts_query IS NOT NULL THEN ts_rank(i.search_vector, q_params.fts_query) * 2.0 ELSE 0 END,
          0
        ) +
        (
          COALESCE(similarity(public.f_unaccent(i.name), q_params.cq) * 2.0, 0) +
          COALESCE(word_similarity(q_params.cq, public.f_unaccent(i.name)) * 1.5, 0) +
          COALESCE(similarity(public.f_unaccent(coalesce(i.unit, '')), q_params.cq) * 0.5, 0)
        )
      )::float8 AS rank
    FROM ingredients i, q_params
    WHERE
      (q_params.fts_query IS NOT NULL AND i.search_vector @@ q_params.fts_query)
      OR public.f_unaccent(i.name) % q_params.cq
      OR q_params.cq <% public.f_unaccent(i.name)
      OR (
        length(q_params.cq) < 3 AND public.f_unaccent(i.name) ILIKE ('%' || q_params.cq || '%')
      )
    ORDER BY rank DESC, i.name ASC
  `;
  return rows;
}

/** Search profiles via Postgres FTS & fuzzy trigram similarity: email (A), display_name (B). */
export async function searchProfilesFts(
  q: string,
  options: SearchOptions = {},
): Promise<FtsHit[]> {
  const tsQuery = buildTsQuery(q);
  const cleanQ = cleanSearchQuery(q);
  const enableFuzzy = options.fuzzy !== false && cleanQ.length > 0;

  if (!tsQuery && !enableFuzzy) return [];

  if (!enableFuzzy) {
    if (!tsQuery) return [];
    const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
      WITH q AS (SELECT to_tsquery('simple', ${tsQuery}) AS query)
      SELECT
        p.id,
        ts_rank(
          p.search_vector || setweight(to_tsvector('simple', translate(public.f_unaccent(coalesce(p.email, '')), '@._-', '    ')), 'A'),
          q.query
        )::float8 AS rank
      FROM profiles p, q
      WHERE (
        p.search_vector || setweight(to_tsvector('simple', translate(public.f_unaccent(coalesce(p.email, '')), '@._-', '    ')), 'A')
      ) @@ q.query
      ORDER BY rank DESC, p.created_at DESC
    `;
    return rows;
  }

  const rows = await prisma.$queryRaw<Array<{ id: string; rank: number }>>`
    WITH q_params AS (
      SELECT
        CASE WHEN ${tsQuery}::text IS NOT NULL THEN to_tsquery('simple', ${tsQuery}::text) ELSE NULL END AS fts_query,
        ${cleanQ}::text AS cq
    )
    SELECT
      p.id,
      (
        COALESCE(
          CASE WHEN q_params.fts_query IS NOT NULL THEN
            ts_rank(p.search_vector || setweight(to_tsvector('simple', translate(public.f_unaccent(coalesce(p.email, '')), '@._-', '    ')), 'A'), q_params.fts_query) * 2.0
          ELSE 0 END,
          0
        ) +
        (
          COALESCE(similarity(public.f_unaccent(coalesce(p.display_name, '')), q_params.cq) * 2.0, 0) +
          COALESCE(word_similarity(q_params.cq, public.f_unaccent(coalesce(p.display_name, ''))) * 1.5, 0) +
          COALESCE(similarity(lower(p.email), q_params.cq) * 1.5, 0) +
          COALESCE(word_similarity(q_params.cq, lower(p.email)) * 1.0, 0)
        )
      )::float8 AS rank
    FROM profiles p, q_params
    WHERE
      (
        q_params.fts_query IS NOT NULL AND (
          p.search_vector || setweight(to_tsvector('simple', translate(public.f_unaccent(coalesce(p.email, '')), '@._-', '    ')), 'A')
        ) @@ q_params.fts_query
      )
      OR public.f_unaccent(coalesce(p.display_name, '')) % q_params.cq
      OR q_params.cq <% public.f_unaccent(coalesce(p.display_name, ''))
      OR lower(p.email) % q_params.cq
      OR q_params.cq <% lower(p.email)
      OR (
        length(q_params.cq) < 3 AND (
          public.f_unaccent(coalesce(p.display_name, '')) ILIKE ('%' || q_params.cq || '%')
          OR lower(p.email) ILIKE ('%' || q_params.cq || '%')
        )
      )
    ORDER BY rank DESC, p.created_at DESC
  `;
  return rows;
}

export const searchDishesFuzzy = searchDishesFts;
export const searchChefsFuzzy = searchChefsFts;
export const searchIngredientsFuzzy = searchIngredientsFts;
export const searchProfilesFuzzy = searchProfilesFts;

/**
 * Sort an array of IDs according to the rank order from `ftsHits`.
 */
export function orderIdsByFtsRank(matchingIds: string[], ftsHits: FtsHit[]): string[] {
  const allowed = new Set(matchingIds);
  return ftsHits.filter((h) => allowed.has(h.id)).map((h) => h.id);
}

/**
 * Reorder fetched entities to match an ordered list of IDs.
 */
export function sortEntitiesByIds<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const indexMap = new Map<string, number>();
  orderedIds.forEach((id, idx) => indexMap.set(id, idx));
  return [...items].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0));
}
