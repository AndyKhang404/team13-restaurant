/**
 * Manages token revocation timestamps when users reset or change passwords.
 * In-memory map (userId -> timestamp in seconds).
 * When a user resets their password, any JWT issued prior to that timestamp (iat <= resetAt)
 * is rejected by backend authentication middleware.
 */

const userPasswordResetAt = new Map<string, number>();

export function recordPasswordReset(userId: string): void {
  // Use current epoch time in seconds
  userPasswordResetAt.set(userId, Math.floor(Date.now() / 1000));
}

export function isTokenRevoked(userId: string, iat?: number): boolean {
  if (!iat) return false;
  const resetAt = userPasswordResetAt.get(userId);
  if (!resetAt) return false;
  return iat <= resetAt;
}

export function clearRevocationState(): void {
  userPasswordResetAt.clear();
}
