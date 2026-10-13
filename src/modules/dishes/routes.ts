import { Router } from 'express';
import { z } from 'zod';
import { DishCategory } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { listParams, isNotFound, isUniqueViolation, paramId } from '../../lib/admin.js';
import { slugify, nextFreeSlug } from '../../lib/slug.js';
import {
  requiredText,
  optionalText,
  decimal,
  optionalInt,
  optionalUuid,
  checkbox,
  toFieldErrors,
  type FieldErrors,
} from '../../lib/validation.js';
import { fileFor, validateImage, saveWithImage, type UploadedFile } from '../../lib/storage.js';
import { CATEGORY_LABELS } from '../../lib/format.js';
import { requirePermission } from '../../auth/middleware.js';

const router = Router();

const CATEGORIES = Object.values(DishCategory);

const DishIngredientItemSchema = z.object({
  ingredientId: z.uuid({ error: 'Nguyên liệu không hợp lệ' }),
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
  prepTimeMinutes: optionalInt('Thời gian chế biến (phút)', 1),
  chefId: optionalUuid,
  removeImage: checkbox,
});

/** Parse dynamically submitted dish ingredient rows from body.
 * Body can have: `ingredient_id[]`, `quantity[]`, `unit[]`
 */
function parseIngredientRows(body: Record<string, unknown>): Array<{ ingredientId: string; quantity: number; unit: string }> {
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

/** Schema-check each ingredient row and reject duplicates.
 * A duplicated ingredient would otherwise violate the (dishId, ingredientId)
 * primary key and crash with a 500, so it is reported as a 422 form error.
 * `raw` rows are echoed back to the form unchanged so the user can fix them.
 */
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
      errors['ingredients'] =
        `Dòng nguyên liệu #${line}: ${first?.message ?? 'không hợp lệ'}`;
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

/** Preload options for dropdowns in dish form (chefs & ingredients).
 * New forms only list active records; edit forms additionally keep records
 * that are already linked to the dish (marked [Deleted] in the template).
 */
async function loadFormDependencies(currentDishId?: string) {
  const linkedDish = currentDishId ? { some: { id: currentDishId } } : undefined;
  const linkedDishIngredient = currentDishId ? { some: { dishId: currentDishId } } : undefined;
  const [chefs, ingredients, currentDish] = await Promise.all([
    prisma.chef.findMany({
      where: currentDishId
        ? { OR: [{ deletedAt: null }, { dishes: linkedDish }] }
        : { deletedAt: null },
      orderBy: { name: 'asc' },
    }),
    prisma.ingredient.findMany({
      where: currentDishId
        ? { OR: [{ deletedAt: null }, { dishes: linkedDishIngredient }] }
        : { deletedAt: null },
      orderBy: { name: 'asc' },
    }),
    currentDishId
      ? prisma.dish.findUnique({
          where: { id: currentDishId },
          include: { ingredients: { include: { ingredient: true } } },
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

router.get('/', requirePermission('dish:create'), async (req, res) => {
  const { page, q, showDeleted, filters } = listParams(req);
  const rawCat = typeof req.query.category === 'string' ? req.query.category : '';
  const category = CATEGORIES.includes(rawCat as DishCategory) ? (rawCat as DishCategory) : undefined;
  if (category) filters['category'] = category;

  const where: Prisma.DishWhereInput = {
    ...(showDeleted ? { deletedAt: { not: null } } : { deletedAt: null }),
    ...(category ? { category } : {}),
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
  };

  const [total, dishes] = await Promise.all([
    prisma.dish.count({ where }),
    prisma.dish.findMany({
      where,
      include: { chef: true },
      orderBy: [{ updatedAt: 'desc' }],
      skip: skipFor(page),
      take: 10,
    }),
  ]);

  res.render('pages/admin/dishes/index', {
    layout: 'admin',
    title: 'Dishes',
    dishes,
    pagination: buildPagination(page, total, filters),
    q,
    category,
    categories: CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] ?? c })),
    showDeleted,
  });
});

router.get('/new', requirePermission('dish:create'), async (_req, res) => {
  const deps = await loadFormDependencies();
  res.render('pages/admin/dishes/form', {
    layout: 'admin',
    title: 'Món mới',
    isNew: true,
    values: { isAvailable: true, isFeatured: false, category: 'main' },
    dishIngredients: [],
    ...deps,
    errors: {},
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
    const deps = await loadFormDependencies();
    return res.status(422).render('pages/admin/dishes/form', {
      layout: 'admin',
      title: 'Món mới',
      isNew: true,
      values: req.body,
      dishIngredients: rawRows,
      ...deps,
      errors,
    });
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
    await saveWithImage({ folder: 'dishes', file }, async (imageUrl) => {
      await prisma.dish.create({
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
  } catch (e) {
    if (isUniqueViolation(e, 'slug')) {
      const deps = await loadFormDependencies();
      return res.status(422).render('pages/admin/dishes/form', {
        layout: 'admin',
        title: 'Món mới',
        isNew: true,
        values: req.body,
        dishIngredients: rawRows,
        ...deps,
        errors: { slug: 'Slug này đã được dùng' },
      });
    }
    throw e;
  }

  req.flash('success', `Đã tạo món "${data.name}".`);
  res.redirect('/admin/dishes');
});

router.get('/:id/edit', requirePermission('dish:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const deps = await loadFormDependencies(id);
  const dish = deps.currentDish;
  if (!dish) throw notFound('Dish');

  res.render('pages/admin/dishes/form', {
    layout: 'admin',
    title: `Sửa món: ${dish.name}`,
    isNew: false,
    dish,
    values: dish,
    dishIngredients: dish.ingredients.map((di) => ({
      ingredientId: di.ingredientId,
      quantity: Number(di.quantity),
      unit: di.unit ?? 'g',
    })),
    ...deps,
    errors: {},
  });
});

router.post('/:id', requirePermission('dish:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const existing = await prisma.dish.findUnique({ where: { id } });
  if (!existing) throw notFound('Dish');

  const file = fileFor(req.files, 'image') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = DishSchema.safeParse(req.body);
  const rawRows = parseIngredientRows(req.body as Record<string, unknown>);
  const { rows: ingredientRows, errors: rowErrors } = validateIngredientRows(rawRows);

  if (!parsed.success || imageErr || Object.keys(rowErrors).length > 0) {
    const errors: FieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);
    Object.assign(errors, rowErrors);
    if (imageErr) errors['image'] = imageErr;
    const deps = await loadFormDependencies(id);
    return res.status(422).render('pages/admin/dishes/form', {
      layout: 'admin',
      title: `Sửa món: ${existing.name}`,
      isNew: false,
      dish: existing,
      values: req.body,
      dishIngredients: rawRows,
      ...deps,
      errors,
    });
  }

  const data = parsed.data;
  // Slugs don't change automatically to prevent broken URLs, unless explicitly entered differently
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
          await tx.dish.update({
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
  } catch (e) {
    if (isUniqueViolation(e, 'slug')) {
      const deps = await loadFormDependencies(id);
      return res.status(422).render('pages/admin/dishes/form', {
        layout: 'admin',
        title: `Sửa món: ${existing.name}`,
        isNew: false,
        dish: existing,
        values: req.body,
        dishIngredients: rawRows,
        ...deps,
        errors: { slug: 'Slug này đã được dùng' },
      });
    }
    throw e;
  }

  req.flash('success', `Đã cập nhật món "${data.name}".`);
  res.redirect('/admin/dishes');
});

router.post('/:id/delete', requirePermission('dish:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    await prisma.dish.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    req.flash('success', 'Đã chuyển món vào danh sách đã xóa.');
  } catch (e) {
    if (isNotFound(e)) throw notFound('Dish');
    throw e;
  }
  res.redirect('/admin/dishes');
});

router.post('/:id/restore', requirePermission('dish:restore'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    await prisma.dish.update({
      where: { id },
      data: { deletedAt: null },
    });
    req.flash('success', 'Đã khôi phục món ăn.');
  } catch (e) {
    if (isNotFound(e)) throw notFound('Dish');
    throw e;
  }
  res.redirect('/admin/dishes?deleted=1');
});

export default router;
