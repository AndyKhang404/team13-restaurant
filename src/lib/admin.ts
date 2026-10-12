import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { parsePage } from './pagination.js';

export function listParams(req: Request) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const showDeleted = req.query.deleted === '1';
  const filters: Record<string, string | undefined> = {
    q: q || undefined,
    deleted: showDeleted ? '1' : undefined,
  };
  return {
    page: parsePage(req.query.page),
    q,
    showDeleted,
    filters,
  };
}

export function paramId(raw: unknown): string {
  if (Array.isArray(raw)) return String(raw[0] ?? '');
  return typeof raw === 'string' ? raw : String(raw ?? '');
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
