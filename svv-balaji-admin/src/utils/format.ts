import type { Dayjs } from 'dayjs';

/**
 * Formatting helpers shared across screens, so a date does not read one way on
 * the farmer profile and another on the order list.
 */

const DASH = '—';

/** 07 Aug 2026. Day-first, month named — unambiguous for an Indian ops team. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Decimal columns arrive as strings from Prisma and are kept that way through
 * the type layer so precision is never quietly lost. Format only at the point
 * of display.
 */
export function formatQuantity(value: string | number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || value === '') return DASH;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return String(value);
  const formatted = parsed.toLocaleString('en-IN', { maximumFractionDigits: 3 });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return DASH;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return String(value);
  return parsed.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

/**
 * Antd DatePicker gives a Dayjs; the API's `@IsDateString()` wants ISO 8601.
 * Every form that submits a date goes through this rather than each one
 * picking its own conversion.
 */
export function toIsoDate(value: Dayjs | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export const EM_DASH = DASH;
