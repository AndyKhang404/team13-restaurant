import type { Prisma } from '../generated/prisma/client.js';
import { badRequest, forbidden } from '../lib/http.js';

export type TxClient = Prisma.TransactionClient;

export const SELF_ROLE_CHANGE_MESSAGE = 'Bạn không thể đổi vai trò của chính mình.';
export const SELF_MODIFY_MESSAGE = 'Bạn không thể thực hiện thao tác này với chính mình.';
export const LAST_ADMIN_ROLE_MESSAGE = 'Không thể hạ quyền ADMIN cuối cùng còn lại.';
export const LAST_ADMIN_STATUS_MESSAGE = 'Không thể tạm khóa ADMIN cuối cùng còn lại.';

/**
 * Rejects self-targeting actions on user-management endpoints:
 * - role change: 400 SELF_ROLE_CHANGE (existing contract)
 * - status change: 403 SELF_MODIFY
 */
export function assertNotSelfModify(
  actorId: string | undefined,
  targetId: string,
  kind: 'role' | 'status',
): void {
  if (actorId && actorId === targetId) {
    if (kind === 'role') {
      throw badRequest(SELF_ROLE_CHANGE_MESSAGE, 'SELF_ROLE_CHANGE');
    }
    throw forbidden(SELF_MODIFY_MESSAGE, 'SELF_MODIFY');
  }
}

/**
 * Locks active ADMIN rows inside the current transaction (`SELECT ... FOR UPDATE`)
 * so concurrent role/status/delete requests cannot race past the last-admin check.
 */
export async function hasOtherActiveAdmin(tx: TxClient, excludeUserId: string): Promise<boolean> {
  const activeAdmins = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM profiles
    WHERE role::text = 'ADMIN' AND status::text = 'ACTIVE'
    FOR UPDATE
  `;
  return activeAdmins.some((row) => row.id !== excludeUserId);
}

/**
 * Ensures at least one other active ADMIN remains before demoting or suspending `targetId`.
 * Throws 400 LAST_ADMIN if `targetId` is the last active ADMIN.
 */
export async function assertNotLastActiveAdmin(
  tx: TxClient,
  targetId: string,
  message = LAST_ADMIN_ROLE_MESSAGE,
): Promise<void> {
  const otherExists = await hasOtherActiveAdmin(tx, targetId);
  if (!otherExists) {
    throw badRequest(message, 'LAST_ADMIN');
  }
}
