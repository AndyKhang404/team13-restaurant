import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Role } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound, sendOk } from '../../lib/http.js';
import { buildPagination, skipFor } from '../../lib/pagination.js';
import { paramId } from '../../lib/admin.js';
import {
  parseProfileListQuery,
  buildProfileWhere,
  searchProfilesFts,
  orderIdsByFtsRank,
  sortEntitiesByIds,
} from '../../lib/search.js';
import { requirePermission } from '../../auth/middleware.js';

const router = Router();

const UpdateRoleSchema = z.object({
  role: z.nativeEnum(Role, { error: 'Vai trò được chọn không hợp lệ.' }),
});

const ROLES = Object.values(Role);

router.get('/', requirePermission('user:manage'), async (req, res) => {
  const parsed = parseProfileListQuery(req.query as Record<string, unknown>);
  const ftsHits = parsed.q ? await searchProfilesFts(parsed.q) : undefined;
  const ftsIds = ftsHits ? ftsHits.map((h) => h.id) : undefined;

  const where = buildProfileWhere(parsed, { ftsIds });

  let total: number;
  let users: Awaited<ReturnType<typeof prisma.profile.findMany>>;

  if (ftsHits) {
    const matchingRows = await prisma.profile.findMany({ where, select: { id: true } });
    const orderedIds = orderIdsByFtsRank(
      matchingRows.map((r) => r.id),
      ftsHits,
    );
    total = orderedIds.length;
    const pageIds = orderedIds.slice(skipFor(parsed.page), skipFor(parsed.page) + 10);
    const rawUsers = pageIds.length
      ? await prisma.profile.findMany({ where: { id: { in: pageIds } } })
      : [];
    users = sortEntitiesByIds(rawUsers, pageIds);
  } else {
    [total, users] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: skipFor(parsed.page),
        take: 10,
      }),
    ]);
  }

  return sendOk(res, {
    users,
    roles: ROLES,
    pagination: buildPagination(parsed.page, total, parsed.filters),
    q: parsed.q,
  });
});

async function handleUpdateRole(req: Request, res: Response) {
  const targetId = paramId(req.params.id);
  const currentUserId = req.user?.id;

  // Safeguard 1: Cannot change own role
  if (targetId === currentUserId) {
    throw badRequest('Bạn không thể đổi vai trò của chính mình.', 'SELF_ROLE_CHANGE');
  }

  const parsed = UpdateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest('Vai trò được chọn không hợp lệ.', 'VALIDATION_FAILED');
  }

  const newRole = parsed.data.role;
  const targetUser = await prisma.profile.findUnique({ where: { id: targetId } });
  if (!targetUser) throw notFound('Người dùng');

  // Safeguard 2: Cannot demote the last ADMIN
  if (targetUser.role === Role.ADMIN && newRole !== Role.ADMIN) {
    const adminCount = await prisma.profile.count({ where: { role: Role.ADMIN } });
    if (adminCount <= 1) {
      throw badRequest('Không thể hạ quyền ADMIN cuối cùng còn lại.', 'LAST_ADMIN');
    }
  }

  const updatedUser = await prisma.profile.update({
    where: { id: targetId },
    data: { role: newRole },
  });

  return sendOk(res, {
    user: updatedUser,
    message: `Đã đổi vai trò của ${targetUser.email} thành ${newRole}.`,
  });
}

router.patch('/:id/role', requirePermission('user:manage'), handleUpdateRole);
router.post('/:id/role', requirePermission('user:manage'), handleUpdateRole);

export default router;
