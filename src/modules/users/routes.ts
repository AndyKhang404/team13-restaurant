import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ProfileStatus, Role } from '../../generated/prisma/enums.js';
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
import {
  assertNotLastActiveAdmin,
  assertNotSelfModify,
  LAST_ADMIN_ROLE_MESSAGE,
  LAST_ADMIN_STATUS_MESSAGE,
} from '../../auth/user-guards.js';
import { recordPasswordReset } from '../../auth/token-revocation.js';

const router = Router();

const UpdateRoleSchema = z.object({
  role: z.nativeEnum(Role, { error: 'Vai trò được chọn không hợp lệ.' }),
});

const UpdateStatusSchema = z.object({
  status: z.nativeEnum(ProfileStatus, { error: 'Trạng thái tài khoản không hợp lệ.' }),
});

const ROLES = Object.values(Role);
const STATUSES = Object.values(ProfileStatus);

router.get('/', requirePermission('user:manage'), async (req, res) => {
  const parsed = parseProfileListQuery(req.query as Record<string, unknown>);
  const ftsHits = parsed.q
    ? await searchProfilesFts(parsed.q, { fuzzy: parsed.fuzzy })
    : undefined;
  const ftsIds = ftsHits ? ftsHits.map((h) => h.id) : undefined;

  const where = buildProfileWhere(parsed, { ftsIds });

  const offset = skipFor(parsed.page, parsed.pageSize);
  let total: number;
  let users: Awaited<ReturnType<typeof prisma.profile.findMany>>;

  if (ftsHits) {
    const matchingRows = await prisma.profile.findMany({ where, select: { id: true } });
    const orderedIds = orderIdsByFtsRank(
      matchingRows.map((r) => r.id),
      ftsHits,
    );
    total = orderedIds.length;
    const pageIds = orderedIds.slice(offset, offset + parsed.pageSize);
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
        skip: offset,
        take: parsed.pageSize,
      }),
    ]);
  }

  return sendOk(res, {
    users,
    roles: ROLES,
    statuses: STATUSES,
    pagination: buildPagination(parsed.page, total, parsed.filters, parsed.pageSize),
    q: parsed.q,
  });
});

async function handleUpdateRole(req: Request, res: Response) {
  const targetId = paramId(req.params.id);
  assertNotSelfModify(req.user?.id, targetId, 'role');

  const parsed = UpdateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest('Vai trò được chọn không hợp lệ.', 'VALIDATION_FAILED');
  }

  const newRole = parsed.data.role;
  const updatedUser = await prisma.$transaction(async (tx) => {
    const targetUser = await tx.profile.findUnique({ where: { id: targetId } });
    if (!targetUser) throw notFound('Người dùng');

    if (
      targetUser.role === Role.ADMIN &&
      targetUser.status === ProfileStatus.ACTIVE &&
      newRole !== Role.ADMIN
    ) {
      await assertNotLastActiveAdmin(tx, targetId, LAST_ADMIN_ROLE_MESSAGE);
    }

    return tx.profile.update({
      where: { id: targetId },
      data: { role: newRole },
    });
  });

  return sendOk(res, {
    user: updatedUser,
    message: `Đã đổi vai trò của ${updatedUser.email} thành ${newRole}.`,
  });
}

async function handleUpdateStatus(req: Request, res: Response) {
  const targetId = paramId(req.params.id);
  assertNotSelfModify(req.user?.id, targetId, 'status');

  const parsed = UpdateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest('Trạng thái tài khoản không hợp lệ.', 'VALIDATION_FAILED');
  }

  const newStatus = parsed.data.status;
  const updatedUser = await prisma.$transaction(async (tx) => {
    const targetUser = await tx.profile.findUnique({ where: { id: targetId } });
    if (!targetUser) throw notFound('Người dùng');

    if (
      targetUser.role === Role.ADMIN &&
      targetUser.status === ProfileStatus.ACTIVE &&
      newStatus === ProfileStatus.SUSPENDED
    ) {
      await assertNotLastActiveAdmin(tx, targetId, LAST_ADMIN_STATUS_MESSAGE);
    }

    return tx.profile.update({
      where: { id: targetId },
      data: { status: newStatus },
    });
  });

  if (newStatus === ProfileStatus.SUSPENDED) {
    // Invalidate pre-suspension JWTs so they cannot be reused even if reactivated later.
    recordPasswordReset(targetId);
  }

  return sendOk(res, {
    user: updatedUser,
    message:
      newStatus === ProfileStatus.SUSPENDED
        ? `Đã tạm khóa tài khoản ${updatedUser.email}.`
        : `Đã kích hoạt lại tài khoản ${updatedUser.email}.`,
  });
}

router.patch('/:id/role', requirePermission('user:manage'), handleUpdateRole);
router.post('/:id/role', requirePermission('user:manage'), handleUpdateRole);
router.patch('/:id/status', requirePermission('user:manage'), handleUpdateStatus);
router.post('/:id/status', requirePermission('user:manage'), handleUpdateStatus);

export default router;
