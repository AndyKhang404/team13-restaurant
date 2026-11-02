import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16_384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * Used when the email is unknown so a failed login costs the same scrypt work
 * as a real account. The value is a hash of a random throwaway password.
 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$UgppKS7emVD4bjcHQkz8iw$Eds7fvaevOmVtghZ-I_5aLvDuQKaSGhQxj9oWlyPi7iAsjZZhhMBt7G9TGGHphFnfCsWFk0UPCGj7U5IYlGi5A';

/** Hashes a password with scrypt; the format is self-describing for upgrades. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Verifies a password against the stored scrypt hash without leaking timing. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const hash = stored ?? DUMMY_PASSWORD_HASH;
  const parts = hash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const parsedN = Number(parts[1]);
  const parsedR = Number(parts[2]);
  const parsedP = Number(parts[3]);
  if (![parsedN, parsedR, parsedP].every(Number.isInteger)) return false;

  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (!salt.length || !expected.length) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: parsedN,
      r: parsedR,
      p: parsedP,
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
