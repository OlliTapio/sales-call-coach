/** @file Total functions from untyped sheet or webhook cells to plain values. */

export type ChatId = string & { readonly __brand: 'ChatId' };

export const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const toTrimmed = (value: unknown): string => toText(value).trim();

/** Sheets may hand the id back as a number; Telegram reports it as one. Digits only. */
export const toChatId = (value: unknown): ChatId | null => {
  const digits = toText(value).replace(/\D/g, '');
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- brand constructor
  return digits === '' ? null : (digits as ChatId);
};

/** A blank or junk cell reads as 0, the way `Number(cell) || 0` did. */
export const toNumberOrZero = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const ACTIVE_WORDS: readonly string[] = ['true', 'yes', '1', 'x'];

export const isActive = (value: unknown): boolean =>
  ACTIVE_WORDS.includes(toTrimmed(value).toLowerCase());
