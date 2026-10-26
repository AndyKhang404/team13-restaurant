import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, sendOk } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { isNotFound, paramId } from '../../lib/admin.js';
import {
  parseChefListQuery,
  buildChefWhere,
  buildChefOrderBy,
  searchChefsFts,
  orderIdsByFtsRank,
  sortEntitiesByIds,
} from '../../lib/search.js';
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
  const parsed = parseChefListQuery(req.query as Record<string, unknown>);
  const ftsHits = parsed.q ? await searchChefsFts(parsed.q) : undefined;
  const ftsIds = ftsHits ? ftsHits.map((h) => h.id) : undefined;

  const where = buildChefWhere(parsed, { ftsIds });
  const orderBy = buildChefOrderBy(parsed.effectiveSort);

  const distinctRowsPromise = prisma.chef.findMany({
    where: { deletedAt: null, specialty: { not: null } },
    select: { specialty: true },
    distinct: ['specialty'],
    orderBy: { specialty: 'asc' },
  });

  let total: number;
  let chefs: Awaited<ReturnType<typeof prisma.chef.findMany>>;

  if (parsed.effectiveSort === 'relevance' && ftsHits) {
    const matchingRows = await prisma.chef.findMany({ where, select: { id: true } });
    const orderedIds = orderIdsByFtsRank(
      matchingRows.map((r) => r.id),
      ftsHits,
    );
    total = orderedIds.length;
    const pageIds = orderedIds.slice(skipFor(parsed.page), skipFor(parsed.page) + 10);
    const rawChefs = pageIds.length
      ? await prisma.chef.findMany({ where: { id: { in: pageIds } } })
      : [];
    chefs = sortEntitiesByIds(rawChefs, pageIds);
  } else {
    [total, chefs] = await Promise.all([
      prisma.chef.count({ where }),
      prisma.chef.findMany({
        where,
        orderBy,
        skip: skipFor(parsed.page),
        take: 10,
      }),
    ]);
  }

  const distinctRows = await distinctRowsPromise;
  const specialties = distinctRows
    .map((r) => r.specialty?.trim())
    .filter((s): s is string => Boolean(s));

  return sendOk(res, {
    chefs,
    specialties,
    pagination: buildPagination(parsed.page, total, parsed.filters),
    q: parsed.q,
    sort: parsed.sort,
  });
});

router.get('/:id', requirePermission('chef:update'), async (req, res) => {
  const id = paramId(req.params.id);
  const chef = await prisma.chef.findUnique({ where: { id } });
  if (!chef) throw notFound('Đầu bếp');
  return sendOk(res, { chef });
});

router.post('/', requirePermission('chef:create'), async (req, res) => {
  const file = fileFor(req.files, 'avatar') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = ChefSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['avatar'] = imageErr;
    throw badRequest('Thông tin đầu bếp không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  const data = parsed.data;
  let createdChef: Awaited<ReturnType<typeof prisma.chef.create>> | null = null;
  await saveWithImage(
    { folder: 'chefs', file },
    async (avatarUrl) => {
      createdChef = await prisma.chef.create({
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

  return sendOk(res, { chef: createdChef, message: `Đã tạo đầu bếp "${data.name}".` });
});

async function handleUpdateChef(req: import('express').Request, res: import('express').Response) {
  const id = paramId(req.params.id);
  const chef = await prisma.chef.findUnique({ where: { id } });
  if (!chef) throw notFound('Đầu bếp');

  const file = fileFor(req.files, 'avatar') as UploadedFile | undefined;
  const imageErr = file ? validateImage(file) : null;

  const parsed = ChefSchema.safeParse(req.body);
  if (!parsed.success || imageErr) {
    const errors = parsed.success ? {} : toFieldErrors(parsed.error);
    if (imageErr) errors['avatar'] = imageErr;
    throw badRequest('Thông tin đầu bếp không hợp lệ', 'VALIDATION_FAILED', errors);
  }

  const data = parsed.data;
  let updatedChef: Awaited<ReturnType<typeof prisma.chef.update>> | null = null;
  await saveWithImage(
    {
      folder: 'chefs',
      file,
      remove: data.removeImage,
      currentUrl: chef.avatarUrl,
    },
    async (avatarUrl) => {
      updatedChef = await prisma.chef.update({
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

  return sendOk(res, { chef: updatedChef, message: `Đã cập nhật đầu bếp "${data.name}".` });
}

router.patch('/:id', requirePermission('chef:update'), handleUpdateChef);
router.put('/:id', requirePermission('chef:update'), handleUpdateChef);

router.delete('/:id', requirePermission('chef:delete'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    const existing = await prisma.chef.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) throw notFound('Đầu bếp');
    await prisma.chef.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return sendOk(res, null);
  } catch (e) {
    if (isNotFound(e)) throw notFound('Đầu bếp');
    throw e;
  }
});

router.post('/:id/restore', requirePermission('chef:update'), async (req, res) => {
  const id = paramId(req.params.id);
  try {
    const existing = await prisma.chef.findUnique({ where: { id } });
    if (!existing) throw notFound('Đầu bếp');
    const chef = await prisma.chef.update({
      where: { id },
      data: { deletedAt: null },
    });
    return sendOk(res, { chef, message: `Đã khôi phục đầu bếp "${chef.name}".` });
  } catch (e) {
    if (isNotFound(e)) throw notFound('Đầu bếp');
    throw e;
  }
});

export default router;
