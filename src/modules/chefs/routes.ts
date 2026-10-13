import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { listParams, isNotFound, paramId } from '../../lib/admin.js';
import { requiredText, optionalText, optionalInt, optionalPhone, checkbox, toFieldErrors } from '../../lib/validation.js';
import { fileFor, validateImage, saveWithImage, type UploadedFile } from '../../lib/storage.js';
import { requirePermission } from '../../auth/middleware.js';

const router = Router();

export const ChefSchema = z.object({
  name: requiredText('Họ và tên', 120),
  specialty: optionalText(120),
  bio: optionalText(1000),
  experienceYears: optionalInt('Số năm kinh nghiệm', 0, 100).default(0),
  phone: optionalPhone(),
  isActive: checkbox,
  removeImage: checkbox,
});

router.get('/', requirePermission('chef:create'), async (req, res) => {
  const { page, q, showDeleted, filters } = listParams(req);
  const where: Prisma.ChefWhereInput = {
    ...(showDeleted ? { deletedAt: { not: null } } : { deletedAt: null }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { specialty: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, chefs] = await Promise.all([
    prisma.chef.count({ where }),
    prisma.chef.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: skipFor(page),
      take: 10,
    }),
  ]);

  res.render('pages/admin/chefs/index', {
    layout: 'admin',
    title: 'Danh sách đầu bếp',
    chefs,
    pagination: buildPagination(page, total, filters),
    q,
    showDeleted,
  });
});

router.get('/new', requirePermission('chef:create'), (_req, res) => {
  res.render('pages/admin/chefs/form', {
    layout: 'admin',
    title: 'Đầu bếp mới',
    isNew: true,
    values: { isActive: true, experienceYears: 0 },
    errors: {},
  });
});

router.post('/', requirePermission('chef:create'), async (req, res) => {
  const file = fileFor(req.files, 'avatar') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = ChefSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['avatar'] = imageErr;
    return res.status(400).render('pages/admin/chefs/form', {
      layout: 'admin',
      title: 'Đầu bếp mới',
      isNew: true,
      values: req.body,
      errors,
    });
  }

  const data = parsed.data;
  await saveWithImage(
    { folder: 'chefs', file },
    async (avatarUrl) => {
      await prisma.chef.create({
        data: {
          name: data.name,
          specialty: data.specialty ?? null,
          bio: data.bio ?? null,
          experienceYears: data.experienceYears ?? 0,
          phone: data.phone ?? null,
          isActive: data.isActive,
          avatarUrl: avatarUrl ?? null,
        },
      });
    },
  );

  req.flash('success', `Đã tạo đầu bếp "${data.name}".`);
  res.redirect(303, '/admin/chefs');
});

router.get('/:id/edit', requirePermission('chef:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const chef = await prisma.chef.findUnique({ where: { id } });
  if (!chef) throw notFound('Chef');

  res.render('pages/admin/chefs/form', {
    layout: 'admin',
    title: `Sửa đầu bếp: ${chef.name}`,
    isNew: false,
    chef,
    values: chef,
    errors: {},
  });
});

router.patch('/:id', requirePermission('chef:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const chef = await prisma.chef.findUnique({ where: { id } });
  if (!chef) throw notFound('Chef');

  const file = fileFor(req.files, 'avatar') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = ChefSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['avatar'] = imageErr;
    return res.status(400).render('pages/admin/chefs/form', {
      layout: 'admin',
      title: `Sửa đầu bếp: ${chef.name}`,
      isNew: false,
      chef,
      values: req.body,
      errors,
    });
  }

  const data = parsed.data;
  await saveWithImage(
    {
      folder: 'chefs',
      file,
      remove: data.removeImage,
      currentUrl: chef.avatarUrl,
    },
    async (avatarUrl) => {
      await prisma.chef.update({
        where: { id: chef.id },
        data: {
          name: data.name,
          specialty: data.specialty ?? null,
          bio: data.bio ?? null,
          experienceYears: data.experienceYears ?? 0,
          phone: data.phone ?? null,
          isActive: data.isActive,
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
      });
    },
  );

  req.flash('success', `Đã cập nhật đầu bếp "${data.name}".`);
  res.redirect(303, '/admin/chefs');
});

router.get('/:id/delete', requirePermission('chef:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  const chef = await prisma.chef.findUnique({ where: { id } });
  if (!chef) throw notFound('Chef');

  res.render('pages/admin/chefs/delete', {
    layout: 'admin',
    title: `Xác nhận xóa: ${chef.name}`,
    chef,
  });
});

router.delete('/:id', requirePermission('chef:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    await prisma.chef.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    req.flash('success', 'Đã chuyển đầu bếp vào danh sách đã xóa.');
  } catch (e) {
    if (isNotFound(e)) throw notFound('Chef');
    throw e;
  }
  res.redirect(303, '/admin/chefs');
});

router.post('/:id/restore', requirePermission('chef:restore'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    await prisma.chef.update({
      where: { id },
      data: { deletedAt: null },
    });
    req.flash('success', 'Đã khôi phục đầu bếp.');
  } catch (e) {
    if (isNotFound(e)) throw notFound('Chef');
    throw e;
  }
  res.redirect(303, '/admin/chefs?deleted=1');
});

export default router;
