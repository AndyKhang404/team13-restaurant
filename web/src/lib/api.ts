import type { AuthUser } from './types';

const rawServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
if (!rawServerUrl) {
  throw new Error(
    'VITE_SERVER_URL is not defined. Please set VITE_SERVER_URL in your environment (e.g. VITE_SERVER_URL=http://localhost:3000 in web/.env).',
  );
}

/** Base URL of the backend server without trailing slashes. */
export const SERVER_URL: string = rawServerUrl.replace(/\/+$/, '');

/** Absolute base URL for REST API endpoints (`${SERVER_URL}/api`). */
export const API_BASE: string = `${SERVER_URL}/api`;

export type ApiFieldErrors = Record<string, string>;

/** A failure returned by the API envelope with a real HTTP status. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: ApiFieldErrors,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A technical error: network failure, a non-JSON response, or a non-envelope HTTP error. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? (status === 0 ? 'Không kết nối được máy chủ.' : `Lỗi hệ thống (HTTP ${status}).`));
    this.name = 'HttpError';
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; fields?: ApiFieldErrors };
}

let csrfToken = '';

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function getCsrfToken(): string {
  return csrfToken;
}

const TOKEN_KEY = 'auth_token';
let authToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (typeof localStorage !== 'undefined') {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}

export function getAuthToken(): string | null {
  if (!authToken && typeof localStorage !== 'undefined') {
    authToken = localStorage.getItem(TOKEN_KEY);
  }
  return authToken;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
}

/** Statuses a dev proxy returns while the API is still booting/restarting. */
const TRANSIENT_STATUS = new Set([502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries idempotent requests (GET/HEAD) a few times on a transient network
 * error or a proxy 502/503/504, so the SPA survives the API's startup/restart
 * window during development. Non-idempotent requests are never retried.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  method: string,
): Promise<Response> {
  const maxAttempts = method === 'GET' || method === 'HEAD' ? 5 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const lastAttempt = attempt === maxAttempts;
    try {
      const res = await fetch(url, init);
      if (!lastAttempt && TRANSIENT_STATUS.has(res.status)) {
        await delay(250 * attempt);
        continue;
      }
      return res;
    } catch {
      if (lastAttempt) throw new HttpError(0);
      await delay(250 * attempt);
    }
  }

  throw new HttpError(0);
}

/**
 * Calls the API, unwraps the `{ ok, data }` envelope and throws `ApiError`
 * for business failures (400/401/403/404/409/422).
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
  retryCsrf = true,
): Promise<T> {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();

  let body = options.body;
  if (
    body &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams)
  ) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers.set('x-csrf-token', csrfToken);
  }

  const res = await fetchWithRetry(
    url,
    { ...options, headers, body, credentials: 'include' },
    method,
  );

  if (res.status === 401) {
    setAuthToken(null);
  }

  let json: Partial<Envelope<T>> | null = null;
  try {
    json = (await res.json()) as Partial<Envelope<T>>;
  } catch {
    json = null;
  }

  // Handler-produced business errors are HTTP 200 with `{ ok: false, error }`.
  if (json?.ok === true) {
    return json.data as T;
  }

  const code = json?.error?.code;
  const message = json?.error?.message;

  if (json?.ok === false) {
    const error = new ApiError(res.status, code ?? 'ERROR', message ?? 'Đã xảy ra lỗi.', json.error?.fields);
    if (error.code === 'CSRF_INVALID' && retryCsrf) {
      await loadSession();
      return apiFetch<T>(path, options, false);
    }
    throw error;
  }

  // Technical errors (wrong URL, crash, auth): real status, body without `ok`.
  if (code === 'CSRF_INVALID' && retryCsrf) {
    await loadSession();
    return apiFetch<T>(path, options, false);
  }
  throw new HttpError(res.status, message);
}

/** Loads the cookie session and refreshes the CSRF token bound to this browser. */
export async function loadSession(): Promise<{ user: AuthUser | null; csrfToken: string }> {
  const data = await apiFetch<{ user: AuthUser | null; csrfToken: string }>('/auth/me');
  setCsrfToken(data.csrfToken);
  return data;
}
