import { ProfileStatus, Role } from '../generated/prisma/enums.js';
import { can, type Permission } from './permissions.js';

export type Action = Permission;

export interface Subject {
  id: string;
  role: Role;
  status?: ProfileStatus | null;
}

export interface Resource {
  createdBy?: string | null;
  deletedAt?: Date | null;
}

export interface Denial {
  code: 'ACCOUNT_SUSPENDED' | 'ACCOUNT_NOT_ACTIVATED' | 'NOT_OWNER' | 'FORBIDDEN';
  message: string;
  fields?: Record<string, string>;
}

export type PolicyResult = Denial | null;

export type ResourceKind = 'dish' | 'chef' | 'ingredient';

export interface RowPermissions {
  canUpdate: boolean;
  canDelete: boolean;
  canRestore: boolean;
}

type Policy = (subject: Subject, action: Action, resource?: Resource) => PolicyResult;

const CONTENT_MUTATION_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'dish:update',
  'dish:delete',
  'chef:update',
  'chef:delete',
  'ingredient:update',
  'ingredient:delete',
]);

export const ACCOUNT_SUSPENDED_MESSAGE = 'Tài khoản của bạn đã bị tạm khóa.';
export const ACCOUNT_PENDING_MESSAGE = 'Tài khoản của bạn chưa được kích hoạt.';
export const NOT_OWNER_MESSAGE = 'Bạn chỉ có thể chỉnh sửa nội dung do chính mình tạo.';
export const FORBIDDEN_MESSAGE = 'Bạn không có quyền thực hiện thao tác này.';
export const DISH_ADMIN_FIELDS_MESSAGE =
  'Chỉ quản trị viên mới có quyền thay đổi đầu bếp phụ trách hoặc trạng thái nổi bật.';

/**
 * ABAC deny-overrides rules evaluated after the RBAC coarse check.
 * Returning `null` means no opinion (allow unless another policy vetoes).
 */
const policies: Policy[] = [
  // 1. Suspended and pending (unactivated) accounts are denied regardless of role.
  (subject) => {
    if (subject.status === ProfileStatus.SUSPENDED) {
      return { code: 'ACCOUNT_SUSPENDED', message: ACCOUNT_SUSPENDED_MESSAGE };
    }
    if (subject.status === ProfileStatus.PENDING) {
      return { code: 'ACCOUNT_NOT_ACTIVATED', message: ACCOUNT_PENDING_MESSAGE };
    }
    return null;
  },

  // 2. STAFF may only update or restore rows they created.
  //    Legacy rows with `createdBy === null` are mutable by ADMIN only.
  (subject, action, resource) => {
    if (
      subject.role === Role.STAFF &&
      CONTENT_MUTATION_ACTIONS.has(action) &&
      resource !== undefined &&
      (!subject.id || resource.createdBy !== subject.id)
    ) {
      return { code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE };
    }
    return null;
  },
];

/**
 * Evaluates RBAC + ABAC (deny-overrides).
 * Returns `null` when allowed, or a `Denial` describing why access was rejected.
 */
export function authorize(
  subject: Subject | null | undefined,
  action: Action,
  resource?: Resource,
): PolicyResult {
  if (!subject) {
    return { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE };
  }

  // Check account status before RBAC so suspended/pending accounts always receive their specific denial.
  const statusDenial = policies[0]!(subject, action, resource);
  if (statusDenial) return statusDenial;

  if (!can(subject, action)) {
    return { code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE };
  }

  for (let i = 1; i < policies.length; i++) {
    const denial = policies[i]!(subject, action, resource);
    if (denial) return denial;
  }

  return null;
}

export interface DishAdminFields {
  chefId?: string | null;
  isFeatured?: boolean;
}

/**
 * Field-level ABAC for dishes: only ADMIN may assign/change `chefId` or `isFeatured`.
 * On create (`existing` omitted), STAFF cannot pass a non-null `chefId` or `isFeatured: true`.
 * On update (`existing` provided), STAFF cannot change either field from its DB value.
 */
export function checkDishAdminFields(
  subject: Subject | null | undefined,
  next: DishAdminFields,
  existing?: DishAdminFields | null,
): PolicyResult {
  if (!subject || subject.role !== Role.STAFF) return null;

  const fields: Record<string, string> = {};
  const nextChefId = next.chefId ?? null;
  const prevChefId = existing?.chefId ?? null;
  if (existing ? nextChefId !== prevChefId : nextChefId !== null) {
    fields['chefId'] = DISH_ADMIN_FIELDS_MESSAGE;
  }

  const nextFeatured = Boolean(next.isFeatured);
  const prevFeatured = Boolean(existing?.isFeatured);
  if (existing ? nextFeatured !== prevFeatured : nextFeatured !== false) {
    fields['isFeatured'] = DISH_ADMIN_FIELDS_MESSAGE;
  }

  if (Object.keys(fields).length > 0) {
    return {
      code: 'FORBIDDEN',
      message: DISH_ADMIN_FIELDS_MESSAGE,
      fields,
    };
  }

  return null;
}

/** Boolean helper for computing UI capability flags without throwing. */
export function canMutate(
  subject: Subject | null | undefined,
  action: Action,
  resource?: Resource,
): boolean {
  return authorize(subject, action, resource) === null;
}

/** Computes per-row ABAC write flags for admin list and detail responses. */
export function getRowPermissions(
  kind: ResourceKind,
  row: Resource,
  subject: Subject | null | undefined,
): RowPermissions {
  const updateAction = `${kind}:update` as Action;
  const deleteAction = `${kind}:delete` as Action;
  const isDeleted = row.deletedAt != null;

  return {
    canUpdate: canMutate(subject, updateAction, row),
    canDelete: !isDeleted && canMutate(subject, deleteAction, row),
    canRestore: isDeleted && canMutate(subject, updateAction, row),
  };
}

/** Attaches `permissions` flags onto a content row for admin/staff responses. */
export function withRowPermissions<T extends Resource>(
  kind: ResourceKind,
  row: T,
  subject: Subject | null | undefined,
): T & { permissions: RowPermissions } {
  return {
    ...row,
    permissions: getRowPermissions(kind, row, subject),
  };
}

/** Strips `createdBy` from public responses so owner UUIDs are not exposed to visitors. */
export function stripCreatedBy<T extends { createdBy?: unknown }>(row: T): Omit<T, 'createdBy'> {
  const copy = { ...row };
  delete copy.createdBy;
  return copy;
}
