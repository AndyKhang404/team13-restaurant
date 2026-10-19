import type { Response } from 'express';

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'AUTH_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CONFLICT'
  | 'SELF_ROLE_CHANGE'
  | 'LAST_ADMIN'
  | 'RATE_LIMITED'
  | 'CSRF_INVALID'
  | 'UPLOAD_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: ApiErrorCode | string;
    message: string;
    fields?: Record<string, string>;
  };
};

/** Technical failure body: real HTTP status, deliberately without an `ok` flag. */
export type ApiTechnicalFailure = {
  error: {
    code: ApiErrorCode | string;
    message: string;
    fields?: Record<string, string>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: ApiErrorCode | string = 'INTERNAL_ERROR',
    public readonly fields?: Record<string, string>,
    /** `true` for handler-produced business errors (returned as HTTP 200 + `ok:false`). */
    public readonly business = false,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (
  msg = 'Yêu cầu không hợp lệ',
  code: ApiErrorCode | string = 'VALIDATION_FAILED',
  fields?: Record<string, string>,
) => new HttpError(400, msg, code, fields, true);

export const unauthorized = (msg = 'Vui lòng đăng nhập để tiếp tục') =>
  new HttpError(401, msg, 'UNAUTHORIZED');

export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') =>
  new HttpError(403, msg, 'FORBIDDEN');

export const notFound = (what = 'Tài nguyên') =>
  new HttpError(404, `${what} không tồn tại`, 'NOT_FOUND', undefined, true);

export const conflict = (
  msg = 'Dữ liệu bị trùng lặp',
  fields?: Record<string, string>,
) => new HttpError(409, msg, 'ALREADY_EXISTS', fields, true);

/** True when `err` is a handler-produced business error (deck: HTTP 200 + `ok:false`). */
export function isBusinessError(err: unknown): err is HttpError {
  return err instanceof HttpError && err.business;
}

export function sendOk<T>(res: Response, data: T, status = 200): Response {
  const body: ApiSuccess<T> = { ok: true, data };
  return res.status(status).json(body);
}

/**
 * Handler-produced business error: always HTTP 200 with `{ ok: false, error }`
 * so the SPA branches on `error.code` instead of the status (deck slide 13).
 */
export function sendBusinessError(
  res: Response,
  code: ApiErrorCode | string,
  message: string,
  fields?: Record<string, string>,
): Response {
  const body: ApiFailure = {
    ok: false,
    error: {
      code,
      message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    },
  };
  return res.status(200).json(body);
}

/** Body for technical errors (wrong URL, crash, auth): no `ok` flag (deck slide 13). */
export function technicalErrorBody(
  code: ApiErrorCode | string,
  message: string,
  fields?: Record<string, string>,
): ApiTechnicalFailure {
  return {
    error: {
      code,
      message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    },
  };
}

/**
 * Envelope error with an explicit status. Kept for out-of-contract flows
 * (auth, rate limit, uploads) that the SPA reads as `ApiError`.
 */
export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode | string,
  message: string,
  fields?: Record<string, string>,
): Response {
  const body: ApiFailure = {
    ok: false,
    error: {
      code,
      message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    },
  };
  return res.status(status).json(body);
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(raw: unknown, fallback = '/'): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback;
}

