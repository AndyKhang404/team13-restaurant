import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../auth/middleware.js';
import dishesRouter from '../dishes/routes.js';
import chefsRouter from '../chefs/routes.js';
import ingredientsRouter from '../ingredients/routes.js';
import usersRouter from '../users/routes.js';

const router = Router();

// Block 8 only requires an authenticated ACTIVE account for content CRUD.
// Fine-grained role permissions remain in /admin/users for Block 9.
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const [dishCount, chefCount, ingredientCount, userCount, recentDishes] = await Promise.all([
    prisma.dish.count({ where: { deletedAt: null } }),
    prisma.chef.count({ where: { deletedAt: null } }),
    prisma.ingredient.count({ where: { deletedAt: null } }),
    prisma.profile.count(),
    prisma.dish.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { chef: true },
    }),
  ]);

  res.render('pages/admin/index', {
    layout: 'admin',
    title: 'Admin Dashboard',
    stats: {
      dishCount,
      chefCount,
      ingredientCount,
      userCount,
    },
    recentDishes,
  });
});

router.use('/dishes', dishesRouter);
router.use('/chefs', chefsRouter);
router.use('/ingredients', ingredientsRouter);
router.use('/users', usersRouter);

export default router;
