import { Router } from 'express';
import { DishCategory } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { sendOk } from '../../lib/http.js';
import { CATEGORY_LABELS } from '../../lib/format.js';
import {
  parseDishListQuery,
  buildDishWhere,
  buildDishOrderBy,
  searchDishesFts,
  orderIdsByFtsRank,
  sortEntitiesByIds,
} from '../../lib/search.js';

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

router.get('/menu', async (req, res) => {
  const parsed = parseDishListQuery(req.query as Record<string, unknown>);
  const ftsHits = parsed.q ? await searchDishesFts(parsed.q, { fuzzy: parsed.fuzzy }) : undefined;
  const ftsIds = ftsHits ? ftsHits.map((h) => h.id) : undefined;

  const where = buildDishWhere(parsed, { hasStaffPerm: false, ftsIds });
  const orderBy = buildDishOrderBy(parsed.effectiveSort);

  let dishes: Awaited<ReturnType<typeof prisma.dish.findMany>>;
  if (parsed.effectiveSort === 'relevance' && ftsHits) {
    const matchingRows = await prisma.dish.findMany({ where, select: { id: true } });
    const orderedIds = orderIdsByFtsRank(
      matchingRows.map((r) => r.id),
      ftsHits,
    );
    const rawDishes = orderedIds.length
      ? await prisma.dish.findMany({ where: { id: { in: orderedIds } }, include: { chef: true } })
      : [];
    dishes = sortEntitiesByIds(rawDishes, orderedIds);
  } else {
    dishes = await prisma.dish.findMany({
      where,
      include: { chef: true },
      orderBy,
    });
  }

  const flat = Boolean(parsed.q) || parsed.sort !== '';
  const selectedCats = parsed.categories;

  const groups = flat
    ? []
    : CATEGORIES.filter((c) => !selectedCats || selectedCats.includes(c))
        .map((c) => ({
          key: c,
          label: CATEGORY_LABELS[c] ?? c,
          dishes: dishes.filter((d) => d.category === c),
        }))
        .filter((g) => g.dishes.length > 0);

  const category =
    selectedCats && selectedCats.length === 1 ? selectedCats[0] : selectedCats?.join(',');

  return sendOk(res, {
    groups,
    flat,
    dishes,
    q: parsed.q,
    sort: parsed.sort,
    resultCount: dishes.length,
    category,
    categories: CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] ?? c })),
  });
});

export default router;
