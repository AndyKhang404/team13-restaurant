export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what = 'Page') => new HttpError(404, `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') =>
  new HttpError(403, msg);

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(raw: unknown, fallback = '/'): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback;
}
