/**
 * Formatting helpers shared by Handlebars helpers and services.
 */
const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

export function formatVnd(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(String(value ?? ''));
  return Number.isFinite(n) ? vnd.format(n) : '';
}

export function formatDateTime(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : dateTime.format(d);
}

export const CATEGORY_LABELS: Record<string, string> = {
  appetizer: 'Appetizers',
  main: 'Main dishes',
  dessert: 'Desserts',
  drink: 'Drinks',
  combo: 'Combos',
};
