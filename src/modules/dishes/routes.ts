import { Router } from 'express';
import { z } from 'zod';
import { DishCategory } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, sendOk } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { bumpVisibleRecordCount, getVisibleRecordCount } from '../../lib/record-counters.js';
import { isNotFound, isUniqueViolation, paramId } from '../../lib/admin.js';
import {
  parseDishListQuery,
  buildDishWhere,
  buildDishOrderBy,
  searchDishesFts,
  orderIdsByFtsRank,
  sortEntitiesByIds,
} from '../../lib/search.js';
import { slugify, nextFreeSlug } from '../../lib/slug.js';
import {
  requiredText,
  optionalText,
  decimal,
  optionalInt,
  uuid,
  optionalUuid,
  checkbox,
  toFieldErrors,
  type FieldErrors,
} from '../../lib/validation.js';
import { fileFor, validateImage, saveWithImage, type UploadedFile } from '../../lib/storage.js';
import { CATEGORY_LABELS } from '../../lib/format.js';
import { can } from '../../auth/permissions.js';
import { requirePermission } from '../../auth/middleware.js';

const router = Router();

const CATEGORIES = Object.values(DishCategory);

const DishIngredientItemSchema = z.object({
  ingredientId: uuid('Nguyên liệu'),
  quantity: decimal('Số lượng', 0.01),
  unit: optionalText(30).default('g'),
});

const DishSchema = z.object({
  name: requiredText('Tên món', 120),
  slug: optionalText(120),
  description: optionalText(2000),
  price: decimal('Giá bán (VND)', 0),
  category: z.nativeEnum(DishCategory, { error: 'Danh mục không hợp lệ' }),
  isAvailable: checkbox,
  isFeatured: checkbox,
  prepTimeMinutes: optionalInt('Thời gian chuẩn bị (phút)', 1),
  chefId: optionalUuid,
  removeImage: checkbox,
});

/** Parse dynamically submitted dish ingredient rows from body.
 * Supports:
 * - JSON array of objects: `body.ingredients = [{ ingredientId, quantity, unit }]`
 * - JSON string: `body.ingredients = '[{...}]'`
 * - Multi-field form: `ingredient_id[]`, `quantity[]`, `unit[]`
 */
function parseIngredientRows(
  body: Record<string, unknown>,
): Array<{ ingredientId: string; quantity: number; unit: string }> {
  if (Array.isArray(body['ingredients'])) {
    return (body['ingredients'] as Array<Record<string, unknown>>)
      .map((item) => ({
        ingredientId: String(item?.['ingredientId'] ?? item?.['ingredient_id'] ?? '').trim(),
        quantity: Number(item?.['quantity']),
        unit: String(item?.['unit'] ?? 'g').trim() || 'g',
      }))
      .filter((r) => r.ingredientId && Number.isFinite(r.quantity) && r.quantity > 0);
  }

  if (typeof body['ingredients'] === 'string') {
    try {
      const parsed = JSON.parse(body['ingredients']);
      if (Array.isArray(parsed)) {
        return (parsed as Array<Record<string, unknown>>)
          .map((item) => ({
            ingredientId: String(item?.['ingredientId'] ?? item?.['ingredient_id'] ?? '').trim(),
            quantity: Number(item?.['quantity']),
            unit: String(item?.['unit'] ?? 'g').trim() || 'g',
          }))
          .filter((r) => r.ingredientId && Number.isFinite(r.quantity) && r.quantity > 0);
      }
    } catch {
      // Ignore JSON parse errors for non-JSON strings
    }
  }

  const ids = Array.isArray(body['ingredient_id'])
    ? (body['ingredient_id'] as string[])
    : body['ingredient_id']
      ? [String(body['ingredient_id'])]
      : [];
  const quantities = Array.isArray(body['quantity'])
    ? (body['quantity'] as string[])
    : body['quantity']
      ? [String(body['quantity'])]
      : [];
  const units = Array.isArray(body['unit'])
    ? (body['unit'] as string[])
    : body['unit']
      ? [String(body['unit'])]
      : [];

  const rows: Array<{ ingredientId: string; quantity: number; unit: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]?.trim();
    const qty = Number(quantities[i]);
    const unit = units[i]?.trim() || 'g';
    if (id && Number.isFinite(qty) && qty > 0) {
      rows.push({ ingredientId: id, quantity: qty, unit });
    }
  }
  return rows;
}

/** Schema-check each ingredient row and reject duplicates. */
export function validateIngredientRows(
  raw: Array<{ ingredientId: string; quantity: number; unit: string }>,
): {
  rows: Array<{ ingredientId: string; quantity: number; unit: string }>;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const rows: Array<{ ingredientId: string; quantity: number; unit: string }> = [];
  const seen = new Set<string>();
  raw.forEach((row, i) => {
    const line = i + 1;
    const parsed = DishIngredientItemSchema.safeParse(row);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors['ingredients'] = `Dòng nguyên liệu #${line}: ${first?.message ?? 'không hợp lệ'}`;
      return;
    }
    if (seen.has(parsed.data.ingredientId)) {
      errors['ingredients'] =
        `Nguyên liệu bị trùng ở dòng #${line}. Mỗi nguyên liệu chỉ dùng một lần trong món.`;
      return;
    }
    seen.add(parsed.data.ingredientId);
    rows.push(parsed.data);
  });
  return { rows, errors };
}

/** Preload options for dropdowns in dish form (chefs & ingredients). */
async function loadFormDependencies(
  currentDishId?: string,
  options: { includeCurrentDish?: boolean } = {},
) {
  const includeCurrentDish = options.includeCurrentDish ?? true;
  const linkedDish = currentDishId ? { some: { id: currentDishId } } : undefined;
  const linkedDishIngredient = currentDishId ? { some: { dishId: currentDishId } } : undefined;
  const [chefs, ingredients, currentDish] = await Promise.all([
    prisma.chef.findMany({
      where: currentDishId
        ? { OR: [{ deletedAt: null }, { dishes: linkedDish }] }
        : { deletedAt: null },
      select: {
        id: true,
        name: true,
        specialty: true,
        isActive: true,
        deletedAt: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.ingredient.findMany({
      where: currentDishId
        ? { OR: [{ deletedAt: null }, { dishes: linkedDishIngredient }] }
        : { deletedAt: null },
      select: {
        id: true,
        name: true,
        unit: true,
        isAvailable: true,
        deletedAt: true,
      },
      orderBy: { name: 'asc' },
    }),
    currentDishId && includeCurrentDish
      ? prisma.dish.findUnique({
          where: { id: currentDishId },
          include: {
            chef: true,
            ingredients: {
              include: { ingredient: { select: { id: true, name: true, unit: true } } },
              orderBy: { ingredient: { name: 'asc' } },
            },
          },
        })
      : null,
  ]);

  return {
    chefs: chefs.map((c) => ({
      ...c,
      isDeleted: c.deletedAt !== null,
    })),
    ingredients: ingredients.map((ing) => ({
      ...ing,
      isDeleted: ing.deletedAt !== null,
    })),
    currentDish,
    categories: CATEGORIES.map((cat) => ({ key: cat, label: CATEGORY_LABELS[cat] ?? cat })),
  };
}

router.get('/form-deps', requirePermission('dish:create'), async (req, res) => {
  const rawDishId = typeof req.query.dishId === 'string' ? req.query.dishId.trim() : '';
  const dishId = rawDishId ? paramId(rawDishId) : undefined;
  const deps = await loadFormDependencies(dishId);
  if (dishId && !deps.currentDish) throw notFound('Món ăn');
  return sendOk(res, deps);
});

router.get('/filter-options', async (_req, res) => {
  const [chefs, ingredients, priceAgg] = await Promise.all([
    prisma.chef.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, specialty: true },
      orderBy: { name: 'asc' },
    }),
    prisma.ingredient.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, unit: true },
      orderBy: { name: 'asc' },
    }),
    prisma.dish.aggregate({
      where: { deletedAt: null },
      _min: { price: true },
      _max: { price: true },
    }),
  ]);

  return sendOk(res, {
    chefs,
    ingredients,
    categories: CATEGORIES.map((cat) => ({ key: cat, label: CATEGORY_LABELS[cat] ?? cat })),
    priceRange: {
      min: Number(priceAgg._min.price ?? 0),
      max: Number(priceAgg._max.price ?? 0),
    },
  });
});

router.get('/', async (req, res) => {
  const parsed = parseDishListQuery(req.query as Record<string, unknown>);
  const hasStaffPerm = can(req.user, 'dish:create');

  const ftsHits = parsed.q ? await searchDishesFts(parsed.q, { fuzzy: parsed.fuzzy }) : undefined;
  const ftsIds = ftsHits ? ftsHits.map((h) => h.id) : undefined;

  const where = buildDishWhere(parsed, { hasStaffPerm, ftsIds });
  const orderBy = buildDishOrderBy(parsed.effectiveSort);

  const countFromCounter = !Object.entries(parsed.filters).some(
    ([key, value]) =>
      key !== 'sort' && key !== 'pageSize' && key !== 'fuzzy' && Boolean(value),
  );
  const offset = skipFor(parsed.page, parsed.pageSize);

  let dishes: Awaited<ReturnType<typeof prisma.dish.findMany>>;
  let total: number;

  if (parsed.effectiveSort === 'relevance' && ftsHits) {
    const matchingRows = await prisma.dish.findMany({
      where,
      select: { id: true },
    });
    const orderedIds = orderIdsByFtsRank(
      matchingRows.map((r) => r.id),
      ftsHits,
    );
    total = orderedIds.length;
    const targetIds = orderedIds.slice(offset, offset + parsed.pageSize);

    const rawDishes = targetIds.length
      ? await prisma.dish.findMany({
          where: { id: { in: targetIds } },
          include: { chef: true },
        })
      : [];
    dishes = sortEntitiesByIds(rawDishes, targetIds);
  } else {
    total = countFromCounter
      ? await getVisibleRecordCount('dish')
      : await prisma.dish.count({ where });
    dishes = await prisma.dish.findMany({
      where,
      include: { chef: true },
      orderBy,
      skip: offset,
      take: parsed.pageSize,
    });
  }

  const paginationInfo = buildPagination(parsed.page, total, parsed.filters, parsed.pageSize);

  const category =
    parsed.categories && parsed.categories.length === 1
      ? parsed.categories[0]
      : parsed.categories?.join(',');

  return sendOk(res, {
    dishes,
    pagination: paginationInfo,
    q: parsed.q,
    sort: parsed.sort,
    category,
    categories: CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] ?? c })),
  });
});

router.get('/:idOrSlug', async (req, res) => {
  const raw = req.params.idOrSlug;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);

  const where: Prisma.DishWhereInput = isUuid
    ? { OR: [{ id: raw }, { slug: raw }] }
    : { slug: raw };

  const dish = await prisma.dish.findFirst({
    where,
    include: {
      chef: true,
      ingredients: {
        include: { ingredient: true },
        orderBy: { ingredient: { name: 'asc' } },
      },
    },
  });

  if (!dish) throw notFound('Món ăn');

  const hasStaffPerm = can(req.user, 'dish:create');
  if (dish.deletedAt !== null && !hasStaffPerm) {
    throw notFound('Món ăn');
  }

  const deps = hasStaffPerm
    ? await loadFormDependencies(dish.id, { includeCurrentDish: false })
    : null;
  const chef = dish.chef && dish.chef.deletedAt === null && dish.chef.isActive ? dish.chef : null;

  return sendOk(res, {
    dish,
    chef: dish.chef ?? chef,
    ingredients: dish.ingredients
      .filter((di) => di.ingredient.deletedAt === null)
      .map((di) => di.ingredient.name),
    dishIngredients: dish.ingredients.map((di) => ({
      ingredientId: di.ingredientId,
      quantity: Number(di.quantity),
      unit: di.unit ?? 'g',
    })),
    chefs: deps?.chefs ?? [],
    availableIngredients: deps?.ingredients ?? [],
    categories:
      deps?.categories ?? CATEGORIES.map((cat) => ({ key: cat, label: CATEGORY_LABELS[cat] ?? cat })),
    categoryLabel: CATEGORY_LABELS[dish.category] ?? dish.category,
  });
});

router.post('/', requirePermission('dish:create'), async (req, res) => {
  const file = fileFor(req.files, 'image') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = DishSchema.safeParse(req.body);
  const rawRows = parseIngredientRows(req.body as Record<string, unknown>);
  const { rows: ingredientRows, errors: rowErrors } = validateIngredientRows(rawRows);

  if (!parsed.success || imageErr || Object.keys(rowErrors).length > 0) {
    const errors: FieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
    Object.assign(errors, rowErrors);
    if (imageErr) errors['image'] = imageErr;
    throw badRequest('Thông tin món ăn không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  const data = parsed.data;

  // Auto-generate slug if not provided, or normalize provided slug
  const baseSlug = slugify(data.slug || data.name);
  const existingSlugs = (
    await prisma.dish.findMany({
      where: { slug: { startsWith: baseSlug } },
      select: { slug: true },
    })
  ).map((d) => d.slug);
  const finalSlug = nextFreeSlug(baseSlug, existingSlugs);

  try {
    let createdDish: Awaited<ReturnType<typeof prisma.dish.create>> | null = null;
    await saveWithImage({ folder: 'dishes', file }, async (imageUrl) => {
      createdDish = await prisma.dish.create({
        data: {
          name: data.name,
          slug: finalSlug,
          description: data.description ?? null,
          price: data.price,
          category: data.category,
          isAvailable: data.isAvailable,
          isFeatured: data.isFeatured,
          prepTimeMinutes: data.prepTimeMinutes ?? null,
          chefId: data.chefId ?? null,
          imageUrl: imageUrl ?? null,
          ingredients: {
            create: ingredientRows.map((r) => ({
              ingredientId: r.ingredientId,
              quantity: r.quantity,
              unit: r.unit,
            })),
          },
        },
      });
    });
    bumpVisibleRecordCount('dish', 1);

    return sendOk(res, { dish: createdDish, message: `Đã tạo món "${data.name}".` });
  } catch (e) {
    if (isUniqueViolation(e, 'slug')) {
      throw conflict('Slug này đã được dùng', { slug: 'Slug này đã được dùng' });
    }
    throw e;
  }
});

async function handleUpdateDish(req: import('express').Request, res: import('express').Response) {
  const id = paramId(req.params.id);
  const existing = await prisma.dish.findUnique({ where: { id } });
  if (!existing) throw notFound('Món ăn');

  const file = fileFor(req.files, 'image') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = DishSchema.safeParse(req.body);
  const rawRows = parseIngredientRows(req.body as Record<string, unknown>);
  const { rows: ingredientRows, errors: rowErrors } = validateIngredientRows(rawRows);

  if (!parsed.success || imageErr || Object.keys(rowErrors).length > 0) {
    const errors: FieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
    Object.assign(errors, rowErrors);
    if (imageErr) errors['image'] = imageErr;
    throw badRequest('Thông tin món ăn không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  const data = parsed.data;
  let finalSlug = existing.slug;
  if (data.slug && data.slug !== existing.slug) {
    const baseSlug = slugify(data.slug);
    const existingSlugs = (
      await prisma.dish.findMany({
        where: { slug: { startsWith: baseSlug }, id: { not: existing.id } },
        select: { slug: true },
      })
    ).map((d) => d.slug);
    finalSlug = nextFreeSlug(baseSlug, existingSlugs);
  }

  try {
    let updatedDish: Awaited<ReturnType<typeof prisma.dish.update>> | null = null;
    await saveWithImage(
      {
        folder: 'dishes',
        file,
        remove: data.removeImage,
        currentUrl: existing.imageUrl,
      },
      async (imageUrl) => {
        await prisma.$transaction(async (tx) => {
          await tx.dishIngredient.deleteMany({ where: { dishId: existing.id } });
          updatedDish = await tx.dish.update({
            where: { id: existing.id },
            data: {
              name: data.name,
              slug: finalSlug,
              description: data.description ?? null,
              price: data.price,
              category: data.category,
              isAvailable: data.isAvailable,
              isFeatured: data.isFeatured,
              prepTimeMinutes: data.prepTimeMinutes ?? null,
              chefId: data.chefId ?? null,
              ...(imageUrl !== undefined ? { imageUrl } : {}),
              ingredients: {
                create: ingredientRows.map((r) => ({
                  ingredientId: r.ingredientId,
                  quantity: r.quantity,
                  unit: r.unit,
                })),
              },
            },
          });
        });
      },
    );

    return sendOk(res, { dish: updatedDish, message: `Đã cập nhật món "${data.name}".` });
  } catch (e) {
    if (isUniqueViolation(e, 'slug')) {
      throw conflict('Slug này đã được dùng', { slug: 'Slug này đã được dùng' });
    }
    throw e;
  }
}

router.patch('/:id', requirePermission('dish:update'), handleUpdateDish);
router.put('/:id', requirePermission('dish:update'), handleUpdateDish);

router.delete('/:id', requirePermission('dish:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    const existing = await prisma.dish.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) throw notFound('Món ăn');
    await prisma.dish.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    bumpVisibleRecordCount('dish', -1);
    return sendOk(res, null);
  } catch (e) {
    if (isNotFound(e)) throw notFound('Món ăn');
    throw e;
  }
});

router.post('/:id/restore', requirePermission('dish:update'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    const existing = await prisma.dish.findUnique({ where: { id } });
    if (!existing) throw notFound('Món ăn');
    const wasDeleted = existing.deletedAt !== null;
    const dish = await prisma.dish.update({
      where: { id },
      data: { deletedAt: null },
    });
    if (wasDeleted) bumpVisibleRecordCount('dish', 1);
    return sendOk(res, { dish, message: `Đã khôi phục món "${dish.name}".` });
  } catch (e) {
    if (isNotFound(e)) throw notFound('Món ăn');
    throw e;
  }
});

export default router;
