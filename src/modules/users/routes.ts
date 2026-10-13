import { Router } from 'express';
import { z } from 'zod';
import { Role } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { listParams, paramId } from '../../lib/admin.js';
import { requirePermission } from '../../auth/middleware.js';

const router = Router();

const UpdateRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

const ROLES = Object.values(Role);

router.get('/', requirePermission('user:manage'), async (req, res) => {
  const { page, q, filters } = listParams(req);
  const where: Prisma.ProfileWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: skipFor(page),
      take: 10,
    }),
  ]);

  res.render('pages/admin/users/index', {
    layout: 'admin',
    title: 'Quản lý người dùng',
    users,
    roles: ROLES,
    pagination: buildPagination(page, total, filters),
    q,
  });
});

router.post('/:id/role', requirePermission('user:manage'), async (req, res) => {
  const targetId = paramId(req.params.id);
  const currentUserId = req.user?.id;

  // Safeguard 1: Cannot change own role
  if (targetId === currentUserId) {
    req.flash('error', 'Bạn không thể đổi vai trò của chính mình.');
    return res.redirect('/admin/users');
  }

  const parsed = UpdateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    req.flash('error', 'Vai trò được chọn không hợp lệ.');
    return res.redirect('/admin/users');
  }

  const newRole = parsed.data.role;
  const targetUser = await prisma.profile.findUnique({ where: { id: targetId } });
  if (!targetUser) throw notFound('User');

  // Safeguard 2: Cannot demote the last ADMIN
  if (targetUser.role === Role.ADMIN && newRole !== Role.ADMIN) {
    const adminCount = await prisma.profile.count({ where: { role: Role.ADMIN } });
    if (adminCount <= 1) {
      req.flash('error', 'Không thể hạ quyền ADMIN cuối cùng còn lại.');
      return res.redirect('/admin/users');
    }
  }

  await prisma.profile.update({
    where: { id: targetId },
    data: { role: newRole },
  });

  req.flash('success', `Đã đổi vai trò của ${targetUser.email} thành ${newRole}.`);
  res.redirect('/admin/users');
});

export default router;
