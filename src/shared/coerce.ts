/** @file Total functions from untyped sheet or webhook cells to plain values. */

export type Phone = string & { readonly __brand: 'Phone' };

export const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const toTrimmed = (value: unknown): string => toText(value).trim();

/** Sheets hands numbers back with or without a `+`; WhatsApp reports bare digits. */
export const toPhone = (value: unknown): Phone | null => {
  const digits = toText(value).replace(/\D/g, '');
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- brand constructor
  return digits === '' ? null : (digits as Phone);
};

/** An empty cell is "never answered", which is not the same as zero. */
export const toCallsOrNull = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const toNonZeroOr = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : fallback;
};

const ACTIVE_WORDS: readonly string[] = ['true', 'yes', '1', 'x'];

export const isActive = (value: unknown): boolean =>
  ACTIVE_WORDS.includes(toTrimmed(value).toLowerCase());
