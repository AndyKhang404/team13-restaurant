/** Single normalization policy used by login, registration, OTP and reset. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
