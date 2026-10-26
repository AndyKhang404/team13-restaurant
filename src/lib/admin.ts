import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { notFound } from './http.js';
import { parsePage } from './pagination.js';

export function listParams(req: Request) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const filters: Record<string, string | undefined> = {
    q: q || undefined,
  };
  return {
    page: parsePage(req.query.page),
    q,
    filters,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route :id param. Garbage IDs become 404 instead of crashing Prisma (500),
 * since Prisma rejects malformed UUIDs with a validation error.
 */
export function paramId(raw: unknown): string {
  const id = Array.isArray(raw) ? String(raw[0] ?? '') : typeof raw === 'string' ? raw : String(raw ?? '');
  if (!UUID_RE.test(id)) throw notFound();
  return id;
}

export function isUniqueViolation(e: unknown, field?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  if (!field) return true;
  return JSON.stringify(e.meta ?? {}).includes(field);
}

export function isForeignKeyViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003';
}

export function isNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}

/** Converts Prisma Decimals to strings so form inputs render them verbatim. */
export function decimalToString(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}
