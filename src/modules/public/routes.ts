import { Router } from 'express';
import { DishCategory } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/http.js';
import { CATEGORY_LABELS } from '../../lib/format.js';

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

router.get('/menu', async (req, res) => {
  const raw = typeof req.query.category === 'string' ? req.query.category : '';
  const category = CATEGORIES.includes(raw as DishCategory) ? (raw as DishCategory) : undefined;

  const dishes = await prisma.dish.findMany({
    where: { ...visibleDish, ...(category ? { category } : {}) },
    orderBy: [{ name: 'asc' }],
  });

  const groups = CATEGORIES.filter((c) => !category || c === category)
    .map((c) => ({
      key: c,
      label: CATEGORY_LABELS[c] ?? c,
      dishes: dishes.filter((d) => d.category === c),
    }))
    .filter((g) => g.dishes.length > 0);

  res.render('pages/public/menu', {
    title: 'Menu',
    groups,
    category,
    categories: CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] ?? c })),
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
