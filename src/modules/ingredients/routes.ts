import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { listParams, isNotFound, isUniqueViolation, paramId } from '../../lib/admin.js';
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

/** Case-insensitive name clash (the DB unique index is case-sensitive,
 * so "Thịt bò" vs "THỊT BÒ" would otherwise slip through as duplicates).
 */
async function findNameClash(name: string, excludeId?: string) {
  return prisma.ingredient.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

router.get('/', requirePermission('ingredient:create'), async (req, res) => {
  const { page, q, showDeleted, filters } = listParams(req);
  const where: Prisma.IngredientWhereInput = {
    ...(showDeleted ? { deletedAt: { not: null } } : { deletedAt: null }),
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
  };

  const [total, ingredients] = await Promise.all([
    prisma.ingredient.count({ where }),
    prisma.ingredient.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: skipFor(page),
      take: 10,
    }),
  ]);

  res.render('pages/admin/ingredients/index', {
    layout: 'admin',
    title: 'Ingredients',
    ingredients,
    pagination: buildPagination(page, total, filters),
    q,
    showDeleted,
  });
});

router.get('/new', requirePermission('ingredient:create'), (_req, res) => {
  res.render('pages/admin/ingredients/form', {
    layout: 'admin',
    title: 'Nguyên liệu mới',
    isNew: true,
    values: { unit: 'g', stockQuantity: 0, pricePerUnit: 0, isAvailable: true },
    errors: {},
  });
});

router.post('/', requirePermission('ingredient:create'), async (req, res) => {
  const file = fileFor(req.files, 'image') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = IngredientSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['image'] = imageErr;
    return res.status(422).render('pages/admin/ingredients/form', {
      layout: 'admin',
      title: 'Nguyên liệu mới',
      isNew: true,
      values: req.body,
      errors,
    });
  }

  if (await findNameClash(parsed.data.name)) {
    return res.status(422).render('pages/admin/ingredients/form', {
      layout: 'admin',
      title: 'Nguyên liệu mới',
      isNew: true,
      values: req.body,
      errors: { name: DUPLICATE_NAME_ERROR },
    });
  }

  const data = parsed.data;
  try {
    await saveWithImage({ folder: 'ingredients', file }, async (imageUrl) => {
      await prisma.ingredient.create({
        data: {
          name: data.name,
          unit: data.unit,
          stockQuantity: data.stockQuantity,
          pricePerUnit: data.pricePerUnit,
          isAvailable: data.isAvailable,
          imageUrl: imageUrl ?? null,
        },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e, 'name')) {
      return res.status(422).render('pages/admin/ingredients/form', {
        layout: 'admin',
        title: 'Nguyên liệu mới',
        isNew: true,
        values: req.body,
        errors: { name: DUPLICATE_NAME_ERROR },
      });
    }
    throw e;
  }

  req.flash('success', `Đã tạo nguyên liệu "${data.name}".`);
  res.redirect('/admin/ingredients');
});

router.get('/:id/edit', requirePermission('ingredient:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const ingredient = await prisma.ingredient.findUnique({ where: { id } });
  if (!ingredient) throw notFound('Ingredient');

  res.render('pages/admin/ingredients/form', {
    layout: 'admin',
    title: `Sửa nguyên liệu: ${ingredient.name}`,
    isNew: false,
    ingredient,
    values: ingredient,
    errors: {},
  });
});

router.post('/:id', requirePermission('ingredient:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const ingredient = await prisma.ingredient.findUnique({ where: { id } });
  if (!ingredient) throw notFound('Ingredient');

  const file = fileFor(req.files, 'image') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = IngredientSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['image'] = imageErr;
    return res.status(422).render('pages/admin/ingredients/form', {
      layout: 'admin',
      title: `Sửa nguyên liệu: ${ingredient.name}`,
      isNew: false,
      ingredient,
      values: req.body,
      errors,
    });
  }

  if (await findNameClash(parsed.data.name, id)) {
    return res.status(422).render('pages/admin/ingredients/form', {
      layout: 'admin',
      title: `Sửa nguyên liệu: ${ingredient.name}`,
      isNew: false,
      ingredient,
      values: req.body,
      errors: { name: DUPLICATE_NAME_ERROR },
    });
  }

  const data = parsed.data;
  try {
    await saveWithImage(
      {
        folder: 'ingredients',
        file,
        remove: data.removeImage,
        currentUrl: ingredient.imageUrl,
      },
      async (imageUrl) => {
        await prisma.ingredient.update({
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
  } catch (e) {
    if (isUniqueViolation(e, 'name')) {
      return res.status(422).render('pages/admin/ingredients/form', {
        layout: 'admin',
        title: `Sửa nguyên liệu: ${ingredient.name}`,
        isNew: false,
        ingredient,
        values: req.body,
        errors: { name: DUPLICATE_NAME_ERROR },
      });
    }
    throw e;
  }

  req.flash('success', `Đã cập nhật nguyên liệu "${data.name}".`);
  res.redirect('/admin/ingredients');
});

router.post('/:id/delete', requirePermission('ingredient:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    await prisma.ingredient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    req.flash('success', 'Đã chuyển nguyên liệu vào danh sách đã xóa.');
  } catch (e) {
    if (isNotFound(e)) throw notFound('Ingredient');
    throw e;
  }
  res.redirect('/admin/ingredients');
});

router.post('/:id/restore', requirePermission('ingredient:restore'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    await prisma.ingredient.update({
      where: { id },
      data: { deletedAt: null },
    });
    req.flash('success', 'Đã khôi phục nguyên liệu.');
  } catch (e) {
    if (isNotFound(e)) throw notFound('Ingredient');
    throw e;
  }
  res.redirect('/admin/ingredients?deleted=1');
});

export default router;
