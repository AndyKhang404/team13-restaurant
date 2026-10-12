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
} from '../../lib/validation.js';
import { fileFor, validateImage, saveWithImage, type UploadedFile } from '../../lib/storage.js';
import { CATEGORY_LABELS } from '../../lib/format.js';
import { requirePermission } from '../../auth/middleware.js';

const router = Router();

const CATEGORIES = Object.values(DishCategory);

const DishIngredientItemSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: decimal('Quantity', 0.01),
  unit: optionalText(30).default('g'),
});

const DishSchema = z.object({
  name: requiredText('Name', 120),
  slug: optionalText(120),
  description: optionalText(2000),
  price: decimal('Price', 0),
  category: z.nativeEnum(DishCategory),
  isAvailable: checkbox,
  isFeatured: checkbox,
  prepTimeMinutes: optionalInt('Prep time minutes', 1),
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

/** Preload options for dropdowns in dish form (chefs & ingredients) */
async function loadFormDependencies(currentDishId?: string) {
  const [chefs, ingredients, currentDish] = await Promise.all([
    prisma.chef.findMany({
      where: { OR: [{ deletedAt: null }, { dishes: currentDishId ? { some: { id: currentDishId } } : undefined }] },
      orderBy: { name: 'asc' },
    }),
    prisma.ingredient.findMany({
      where: {
        OR: [{ deletedAt: null }, { dishes: currentDishId ? { some: { dishId: currentDishId } } : undefined }],
      },
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
    title: 'New Dish',
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
  const ingredientRows = parseIngredientRows(req.body as Record<string, unknown>);

  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['image'] = imageErr;
    const deps = await loadFormDependencies();
    return res.status(422).render('pages/admin/dishes/form', {
      layout: 'admin',
      title: 'New Dish',
      isNew: true,
      values: req.body,
      dishIngredients: ingredientRows,
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
        title: 'New Dish',
        isNew: true,
        values: req.body,
        dishIngredients: ingredientRows,
        ...deps,
        errors: { slug: 'This URL slug is already taken' },
      });
    }
    throw e;
  }

  req.flash('success', `Dish "${data.name}" created successfully.`);
  res.redirect('/admin/dishes');
});

router.get('/:id/edit', requirePermission('dish:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const deps = await loadFormDependencies(id);
  const dish = deps.currentDish;
  if (!dish) throw notFound('Dish');

  res.render('pages/admin/dishes/form', {
    layout: 'admin',
    title: `Edit Dish: ${dish.name}`,
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
  const ingredientRows = parseIngredientRows(req.body as Record<string, unknown>);

  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['image'] = imageErr;
    const deps = await loadFormDependencies(id);
    return res.status(422).render('pages/admin/dishes/form', {
      layout: 'admin',
      title: `Edit Dish: ${existing.name}`,
      isNew: false,
      dish: existing,
      values: req.body,
      dishIngredients: ingredientRows,
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
        title: `Edit Dish: ${existing.name}`,
        isNew: false,
        dish: existing,
        values: req.body,
        dishIngredients: ingredientRows,
        ...deps,
        errors: { slug: 'This URL slug is already taken' },
      });
    }
    throw e;
  }

  req.flash('success', `Dish "${data.name}" updated successfully.`);
  res.redirect('/admin/dishes');
});

router.post('/:id/delete', requirePermission('dish:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    await prisma.dish.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    req.flash('success', 'Dish moved to deleted list.');
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
    req.flash('success', 'Dish restored successfully.');
  } catch (e) {
    if (isNotFound(e)) throw notFound('Dish');
    throw e;
  }
  res.redirect('/admin/dishes?deleted=1');
});

export default router;
