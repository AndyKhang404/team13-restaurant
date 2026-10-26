import { Router } from 'express';
import { DishCategory } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { sendOk } from '../../lib/http.js';
import { CATEGORY_LABELS } from '../../lib/format.js';

const router = Router();

/** Dishes visible on the public site: not soft-deleted. */
const visibleDish: Prisma.DishWhereInput = { deletedAt: null };

const CATEGORIES = Object.values(DishCategory);

const getHomeFeatured = async () => {
  return prisma.dish.findMany({
    where: { ...visibleDish, isFeatured: true },
    orderBy: [{ isAvailable: 'desc' }, { updatedAt: 'desc' }],
    take: 8,
  });
};

router.get('/', async (_req, res) => {
  const featured = await getHomeFeatured();
  return sendOk(res, { featured });
});

router.get('/home', async (_req, res) => {
  const featured = await getHomeFeatured();
  return sendOk(res, { featured });
});

const SORTS: Record<string, Prisma.DishOrderByWithRelationInput[]> = {
  '': [{ name: 'asc' }],
  'name-asc': [{ name: 'asc' }],
  'name-desc': [{ name: 'desc' }],
  'price-asc': [{ price: 'asc' }],
  'price-desc': [{ price: 'desc' }],
  newest: [{ updatedAt: 'desc' }],
};

router.get('/menu', async (req, res) => {
  const raw = typeof req.query.category === 'string' ? req.query.category : '';
  const category = CATEGORIES.includes(raw as DishCategory) ? (raw as DishCategory) : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : '';
  const sort = sortRaw in SORTS ? sortRaw : '';
  const flat = Boolean(q) || sort !== '';

  const dishes = await prisma.dish.findMany({
    where: {
      ...visibleDish,
      ...(category ? { category } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: SORTS[sort],
  });

  const groups = flat
    ? []
    : CATEGORIES.filter((c) => !category || c === category)
        .map((c) => ({
          key: c,
          label: CATEGORY_LABELS[c] ?? c,
          dishes: dishes.filter((d) => d.category === c),
        }))
        .filter((g) => g.dishes.length > 0);

  return sendOk(res, {
    groups,
    flat,
    dishes,
    q,
    sort,
    resultCount: dishes.length,
    category,
    categories: CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] ?? c })),
  });
});

export default router;
