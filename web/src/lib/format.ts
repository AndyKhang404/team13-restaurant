const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function formatVnd(value: number | string | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? '');
  return Number.isFinite(n) ? vnd.format(n) : '';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
