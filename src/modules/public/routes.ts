import { Router } from 'express';
import { DishCategory } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/http.js';
import { CATEGORY_LABELS } from '../../lib/format.js';
import {
  MENU_PAGE_SIZE,
  buildPagination,
  pageUrl,
  resolvePage,
  skipFor,
  type Filters,
} from '../../lib/pagination.js';

const router = Router();

/** Dishes visible on the public site: not soft-deleted. */
const visibleDish: Prisma.DishWhereInput = { deletedAt: null };

const CATEGORIES = Object.values(DishCategory);

router.get('/', async (_req, res) => {
  const featured = await prisma.dish.findMany({
    where: { ...visibleDish, isFeatured: true },
    orderBy: [{ isAvailable: 'desc' }, { updatedAt: 'desc' }],
    take: 8,
  });
  res.render('pages/public/home', { title: 'Home', featured });
});

const SORTS: Record<string, Prisma.DishOrderByWithRelationInput[]> = {
  '': [{ createdAt: 'desc' }, { id: 'asc' }],
  'name-asc': [{ name: 'asc' }, { id: 'asc' }],
  'name-desc': [{ name: 'desc' }, { id: 'asc' }],
  'price-asc': [{ price: 'asc' }, { id: 'asc' }],
  'price-desc': [{ price: 'desc' }, { id: 'asc' }],
  newest: [{ updatedAt: 'desc' }, { id: 'asc' }],
};

router.get('/menu', async (req, res) => {
  const raw = typeof req.query.category === 'string' ? req.query.category : '';
  const category = CATEGORIES.includes(raw as DishCategory) ? (raw as DishCategory) : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : '';
  const sort = sortRaw in SORTS ? sortRaw : '';

  const filters: Filters = {
    category,
    q: q || undefined,
    sort: sort || undefined,
  };

  const where: Prisma.DishWhereInput = {
    ...visibleDish,
    ...(category ? { category } : {}),
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
  };

  const total = await prisma.dish.count({ where });

  const { page, redirectPage } = resolvePage(req.query.page, total, MENU_PAGE_SIZE);
  if (redirectPage !== null) {
    return res.redirect(302, pageUrl('/menu', filters, redirectPage));
  }

  const dishes = await prisma.dish.findMany({
    where,
    orderBy: SORTS[sort],
    skip: skipFor(page, MENU_PAGE_SIZE),
    take: MENU_PAGE_SIZE,
  });

  const allHref = pageUrl('/menu', { q: q || undefined, sort: sort || undefined }, 1);
  const categories = CATEGORIES.map((c) => ({
    key: c,
    label: CATEGORY_LABELS[c] ?? c,
    href: pageUrl('/menu', { category: c, q: q || undefined, sort: sort || undefined }, 1),
    active: category === c,
  }));

  res.render('pages/public/menu', {
    title: 'Menu',
    dishes,
    total,
    q,
    sort,
    category,
    pagination: buildPagination({
      basePath: '/menu',
      filters,
      page,
      total,
      pageSize: MENU_PAGE_SIZE,
    }),
    allHref,
    categories,
  });
});

router.get('/dishes/:slug', async (req, res) => {
  const dish = await prisma.dish.findFirst({
    where: { ...visibleDish, slug: req.params.slug },
    include: {
      chef: true,
      ingredients: {
        where: { ingredient: { deletedAt: null } },
        include: { ingredient: { select: { name: true } } },
        orderBy: { ingredient: { name: 'asc' } },
      },
    },
  });
  if (!dish) throw notFound('Dish');

  // Hide deleted or inactive chefs on the public page.
  const chef = dish.chef && dish.chef.deletedAt === null && dish.chef.isActive ? dish.chef : null;

  res.render('pages/public/dish', {
    title: dish.name,
    dish,
    chef,
    ingredients: dish.ingredients.map((di) => di.ingredient.name),
    categoryLabel: CATEGORY_LABELS[dish.category] ?? dish.category,
  });
});

export default router;
