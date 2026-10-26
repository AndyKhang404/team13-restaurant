import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound, sendOk } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { bumpVisibleRecordCount, getVisibleRecordCount } from '../../lib/record-counters.js';
import { isNotFound, isUniqueViolation, paramId } from '../../lib/admin.js';
import {
  parseIngredientListQuery,
  buildIngredientWhere,
  buildIngredientOrderBy,
  searchIngredientsFts,
  orderIdsByFtsRank,
  sortEntitiesByIds,
} from '../../lib/search.js';
import { requiredText, decimal, checkbox, toFieldErrors } from '../../lib/validation.js';
import { fileFor, validateImage, saveWithImage, type UploadedFile } from '../../lib/storage.js';
import { requirePermission } from '../../auth/middleware.js';

const router = Router();

export const IngredientSchema = z.object({
  name: requiredText('Tên nguyên liệu', 120),
  unit: requiredText('Đơn vị', 30).default('g'),
  stockQuantity: decimal('Tồn kho', 0).default(0),
  pricePerUnit: decimal('Giá mỗi đơn vị', 0).default(0),
  isAvailable: checkbox,
  removeImage: checkbox,
});

const DUPLICATE_NAME_ERROR = 'Nguyên liệu này đã tồn tại';

async function findNameClash(name: string, excludeId?: string) {
  return prisma.ingredient.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, deletedAt: true },
  });
}

router.get('/', requirePermission('ingredient:create'), async (req, res) => {
  const parsed = parseIngredientListQuery(req.query as Record<string, unknown>);
  const ftsHits = parsed.q ? await searchIngredientsFts(parsed.q) : undefined;
  const ftsIds = ftsHits ? ftsHits.map((h) => h.id) : undefined;

  const where = buildIngredientWhere(parsed, { ftsIds });
  const orderBy = buildIngredientOrderBy(parsed.effectiveSort);

  const distinctUnitsPromise = prisma.ingredient.findMany({
    where: { deletedAt: null },
    select: { unit: true },
    distinct: ['unit'],
    orderBy: { unit: 'asc' },
  });

  const countFromCounter = !Object.entries(parsed.filters).some(
    ([key, value]) => key !== 'sort' && key !== 'pageSize' && Boolean(value),
  );
  const offset = skipFor(parsed.page, parsed.pageSize);

  let total: number;
  let ingredients: Awaited<ReturnType<typeof prisma.ingredient.findMany>>;

  if (parsed.effectiveSort === 'relevance' && ftsHits) {
    const matchingRows = await prisma.ingredient.findMany({ where, select: { id: true } });
    const orderedIds = orderIdsByFtsRank(
      matchingRows.map((r) => r.id),
      ftsHits,
    );
    total = orderedIds.length;
    const pageIds = orderedIds.slice(offset, offset + parsed.pageSize);
    const rawIngredients = pageIds.length
      ? await prisma.ingredient.findMany({ where: { id: { in: pageIds } } })
      : [];
    ingredients = sortEntitiesByIds(rawIngredients, pageIds);
  } else {
    [total, ingredients] = await Promise.all([
      countFromCounter ? getVisibleRecordCount('ingredient') : prisma.ingredient.count({ where }),
      prisma.ingredient.findMany({
        where,
        orderBy,
        skip: offset,
        take: parsed.pageSize,
      }),
    ]);
  }

  const distinctUnits = await distinctUnitsPromise;
  const units = distinctUnits.map((r) => r.unit?.trim()).filter((u): u is string => Boolean(u));

  return sendOk(res, {
    ingredients,
    units,
    pagination: buildPagination(parsed.page, total, parsed.filters, parsed.pageSize),
    q: parsed.q,
    sort: parsed.sort,
  });
});

router.get('/filter-options', requirePermission('ingredient:create'), async (_req, res) => {
  const rows = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    select: { unit: true },
    distinct: ['unit'],
    orderBy: { unit: 'asc' },
  });
  const units = rows
    .map((row) => row.unit?.trim())
    .filter((value): value is string => Boolean(value));
  return sendOk(res, { units });
});

router.get('/:id', requirePermission('ingredient:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const ingredient = await prisma.ingredient.findUnique({ where: { id } });
  if (!ingredient) throw notFound('Nguyên liệu');
  return sendOk(res, { ingredient });
});

router.post('/', requirePermission('ingredient:create'), async (req, res) => {
  const file = fileFor(req.files, 'image') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = IngredientSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['image'] = imageErr;
    throw badRequest('Thông tin nguyên liệu không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  // A soft-deleted ingredient with the same name is revived instead of
  // reported as a duplicate, so "add → delete → add again" works.
  const clash = await findNameClash(parsed.data.name);
  if (clash && clash.deletedAt === null) {
    throw conflict(DUPLICATE_NAME_ERROR, { name: DUPLICATE_NAME_ERROR });
  }

  const data = parsed.data;
  try {
    let createdIngredient: Awaited<ReturnType<typeof prisma.ingredient.create>> | null = null;
    await saveWithImage({ folder: 'ingredients', file }, async (imageUrl) => {
      const fields = {
        name: data.name,
        unit: data.unit,
        stockQuantity: data.stockQuantity,
        pricePerUnit: data.pricePerUnit,
        isAvailable: data.isAvailable,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      };
      createdIngredient = clash
        ? await prisma.ingredient.update({
            where: { id: clash.id },
            data: { ...fields, deletedAt: null },
          })
        : await prisma.ingredient.create({
            data: { ...fields, imageUrl: imageUrl ?? null },
          });
    });
    bumpVisibleRecordCount('ingredient', 1);

    return sendOk(res, {
      ingredient: createdIngredient,
      message: `Đã tạo nguyên liệu "${data.name}".`,
    });
  } catch (e) {
    if (isUniqueViolation(e, 'name')) {
      throw conflict(DUPLICATE_NAME_ERROR, { name: DUPLICATE_NAME_ERROR });
    }
    throw e;
  }
});

async function handleUpdateIngredient(
  req: import('express').Request,
  res: import('express').Response,
) {
  const id = paramId(req.params.id);
  const ingredient = await prisma.ingredient.findUnique({ where: { id } });
  if (!ingredient) throw notFound('Nguyên liệu');

  const file = fileFor(req.files, 'image') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = IngredientSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['image'] = imageErr;
    throw badRequest('Thông tin nguyên liệu không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  if (await findNameClash(parsed.data.name, id)) {
    throw conflict(DUPLICATE_NAME_ERROR, { name: DUPLICATE_NAME_ERROR });
  }

  const data = parsed.data;
  try {
    let updatedIngredient: Awaited<ReturnType<typeof prisma.ingredient.update>> | null = null;
    await saveWithImage(
      {
        folder: 'ingredients',
        file,
        remove: data.removeImage,
        currentUrl: ingredient.imageUrl,
      },
      async (imageUrl) => {
        updatedIngredient = await prisma.ingredient.update({
          where: { id: ingredient.id },
          data: {
            name: data.name,
            unit: data.unit,
            stockQuantity: data.stockQuantity,
            pricePerUnit: data.pricePerUnit,
            isAvailable: data.isAvailable,
            ...(imageUrl !== undefined ? { imageUrl } : {}),
          },
        });
      },
    );

    return sendOk(res, {
      ingredient: updatedIngredient,
      message: `Đã cập nhật nguyên liệu "${data.name}".`,
    });
  } catch (e) {
    if (isUniqueViolation(e, 'name')) {
      throw conflict(DUPLICATE_NAME_ERROR, { name: DUPLICATE_NAME_ERROR });
    }
    throw e;
  }
}

router.patch('/:id', requirePermission('ingredient:update'), handleUpdateIngredient);
router.put('/:id', requirePermission('ingredient:update'), handleUpdateIngredient);

router.delete('/:id', requirePermission('ingredient:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    const existing = await prisma.ingredient.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) throw notFound('Nguyên liệu');
    await prisma.ingredient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    bumpVisibleRecordCount('ingredient', -1);
    return sendOk(res, null);
  } catch (e) {
    if (isNotFound(e)) throw notFound('Nguyên liệu');
    throw e;
  }
});

router.post('/:id/restore', requirePermission('ingredient:update'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    const existing = await prisma.ingredient.findUnique({ where: { id } });
    if (!existing) throw notFound('Nguyên liệu');
    const wasDeleted = existing.deletedAt !== null;
    const ingredient = await prisma.ingredient.update({
      where: { id },
      data: { deletedAt: null },
    });
    if (wasDeleted) bumpVisibleRecordCount('ingredient', 1);
    return sendOk(res, { ingredient, message: `Đã khôi phục nguyên liệu "${ingredient.name}".` });
  } catch (e) {
    if (isNotFound(e)) throw notFound('Nguyên liệu');
    throw e;
  }
});

export default router;
