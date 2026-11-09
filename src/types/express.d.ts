import type { Profile } from '../generated/prisma/client.js';

export type FlashType = 'success' | 'error' | 'info';
export interface FlashMessage {
  type: FlashType;
  message: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Signed-in user's profile, or null for anonymous visitors. Set by `loadUser`. */
      user: Profile | null;
      /** True if the Bearer token was expired. */
      tokenExpired?: boolean;
      /** True if the Bearer token was revoked prior to expiry. */
      tokenRevoked?: boolean;
      /** Queue a one-time message shown on the next rendered page. */
      flash(type: FlashType, message: string): void;
    }
  }
}

export {};
