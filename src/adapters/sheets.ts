/** @file Raw Google Sheets rows to domain types. Rows without a chat id are dropped. */
import type { Person } from '../domain/model.ts';
import { isActive, toChatId, toNumberOrZero, toTrimmed } from '../shared/coerce.ts';

type Raw = Readonly<Record<string, unknown>>;

export const parsePerson = (raw: Raw): Person | null => {
  const chatId = toChatId(raw['chat_id']);
  if (chatId === null) return null;
  const name = toTrimmed(raw['name']);
  return {
    name: name === '' ? chatId : name,
    chatId,
    focus: toTrimmed(raw['focus']),
    callsTarget: toNumberOrZero(raw['calls_target']),
    hoursCap: toNumberOrZero(raw['hours_cap']),
    active: isActive(raw['active']),
  };
};
