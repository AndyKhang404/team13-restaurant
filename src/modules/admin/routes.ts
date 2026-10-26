import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requirePermission } from '../../auth/middleware.js';
import { sendOk } from '../../lib/http.js';
import { getVisibleRecordCount } from '../../lib/record-counters.js';
import dishesRouter from '../dishes/routes.js';
import chefsRouter from '../chefs/routes.js';
import ingredientsRouter from '../ingredients/routes.js';
import usersRouter from '../users/routes.js';

export const getAdminStats = async () => {
  const [dishCount, chefCount, ingredientCount, userCount, recentDishes] = await Promise.all([
    getVisibleRecordCount('dish'),
    getVisibleRecordCount('chef'),
    getVisibleRecordCount('ingredient'),
    prisma.profile.count(),
    prisma.dish.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { chef: true },
    }),
  ]);

  return {
    stats: {
      dishCount,
      chefCount,
      ingredientCount,
      userCount,
    },
    recentDishes,
  };
};

export const statsRouter = Router();
statsRouter.use(requirePermission('admin:access'));

statsRouter.get('/', async (_req, res) => {
  const data = await getAdminStats();
  return sendOk(res, data);
});

statsRouter.get('/stats', async (_req, res) => {
  const data = await getAdminStats();
  return sendOk(res, data);
});

const adminRouter = Router();

// Every route in /admin requires admin:access (ADMIN and STAFF)
adminRouter.use(requirePermission('admin:access'));

adminRouter.get('/', async (_req, res) => {
  const data = await getAdminStats();
  return sendOk(res, data);
});

adminRouter.get('/stats', async (_req, res) => {
  const data = await getAdminStats();
  return sendOk(res, data);
});

adminRouter.use('/dishes', dishesRouter);
adminRouter.use('/chefs', chefsRouter);
adminRouter.use('/ingredients', ingredientsRouter);
adminRouter.use('/users', usersRouter);

export default adminRouter;

