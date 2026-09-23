/** @file Raw Google Sheets rows to domain types. Rows without a phone number are dropped. */
import type { Person } from '../domain/model.ts';
import { isActive, toNumberOrZero, toPhone, toTrimmed } from '../shared/coerce.ts';

type Raw = Readonly<Record<string, unknown>>;

export const parsePerson = (raw: Raw): Person | null => {
  const phone = toPhone(raw['phone']);
  if (phone === null) return null;
  const name = toTrimmed(raw['name']);
  return {
    name: name === '' ? phone : name,
    phone,
    focus: toTrimmed(raw['focus']),
    callsTarget: toNumberOrZero(raw['calls_target']),
    hoursCap: toNumberOrZero(raw['hours_cap']),
    active: isActive(raw['active']),
  };
};
