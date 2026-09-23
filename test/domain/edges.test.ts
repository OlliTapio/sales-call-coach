import { DateTime } from 'luxon';
import { describe, expect, test, vi } from 'vitest';
import { parseLogEntry, parseWeeklyRow } from '../../src/adapters/sheets.ts';
import { parseInboundTexts } from '../../src/adapters/whatsapp.ts';
import type { LogEntry } from '../../src/domain/model.ts';
import { pendingNudges } from '../../src/domain/nudge.ts';
import { parseReply } from '../../src/domain/reply.ts';
import { aggregateWeek } from '../../src/domain/week.ts';
import { localNow } from '../../src/n8n/clock.ts';
import { isPresent } from '../../src/shared/collections.ts';
import { toCallsOrNull, toNonZeroOr, toText } from '../../src/shared/coerce.ts';
import type { Instant } from '../../src/shared/time.ts';
import { at } from '../support/n8n-sandbox.ts';

vi.stubGlobal('DateTime', DateTime);

const instant = (iso: string): Instant => {
  const value = at(iso);
  if (!value.isValid) throw new Error(iso);
  return value;
};

const entries = (rows: readonly Record<string, unknown>[]): readonly LogEntry[] =>
  rows.map(parseLogEntry).filter(isPresent);

describe('coerce', () => {
  test('non-scalar cells read as empty text', () => {
    expect(toText({ a: 1 })).toBe('');
    expect(toText(true)).toBe('true');
  });

  test('a blank or junk calls cell is "never answered"', () => {
    expect([null, undefined, '', 'abc'].map(toCallsOrNull)).toEqual([null, null, null, null]);
    expect(toCallsOrNull('7')).toBe(7);
  });

  test('zero and junk fall back', () => {
    expect([0, '', 'x', '3'].map((v) => toNonZeroOr(v, 8))).toEqual([8, 8, 8, 3]);
  });
});

describe('parseReply', () => {
  test('a long message with a number is still refused', () => {
    expect(parseReply('I did 6 calls today', 8)).toEqual({ kind: 'unparsed' });
  });

  test('a four-digit number is not a bare number', () => {
    expect(parseReply('1234', 8)).toEqual({ kind: 'unparsed' });
  });
});

describe('pendingNudges', () => {
  test('the latest valid reply opens the window, and junk timestamps are ignored', () => {
    const log = entries([
      { date: '2026-09-18', phone: '1', name: 'A', target: '' },
      {
        date: '2026-09-16',
        phone: '1',
        raw_reply: '5',
        calls: 5,
        logged_at: '2026-09-16T10:00:00+03:00',
      },
      {
        date: '2026-09-17',
        phone: '1',
        raw_reply: '6',
        calls: 6,
        logged_at: '2026-09-17T20:00:00+03:00',
      },
      { date: '2026-09-17', phone: '1', raw_reply: '?', logged_at: 'garbage' },
    ]);
    const [nudge] = pendingNudges(log, instant('2026-09-18T16:30:00'));
    expect(nudge).toMatchObject({ windowOpen: true, hoursSinceLastReply: 21, row: { target: 8 } });
    expect(nudge?.recent).toEqual({ set: 3, reported: 2, calls: 11, target: 0, hit: 0 });
  });

  test('before the rollover hour the lane still works on yesterday', () => {
    const log = entries([{ date: '2026-09-17', phone: '1', name: 'A', target: 8 }]);
    expect(pendingNudges(log, instant('2026-09-18T02:00:00'))[0]?.row.date).toBe('2026-09-17');
  });
});

describe('aggregateWeek', () => {
  test('ties on calls sort by name; a zero target gives 0%', () => {
    const log = entries([
      { date: '2026-09-15', phone: '2', name: 'Bea', target: '', calls: 3 },
      { date: '2026-09-17', phone: '1', name: 'Aki', target: 0, calls: 3 },
    ]);
    const rows = aggregateWeek(log, instant('2026-09-18T17:00:00'));
    expect(rows.map((r) => [r.name, r.tue, r.thu, r.pct_of_target])).toEqual([
      ['Aki', '', 3, 0],
      ['Bea', 3, '', 0],
    ]);
  });
});

describe('adapters', () => {
  test('rows without a phone number are dropped', () => {
    expect(parseLogEntry({ date: '2026-09-18' })).toBeNull();
    expect(parseWeeklyRow({ name: 'x' })).toBeNull();
  });

  test('weekly rows read back from Sheets as text become numbers', () => {
    expect(parseWeeklyRow({ phone: '1', calls: '27', mon: '8', tue: '' })).toMatchObject({
      name: '1',
      calls: 27,
      mon: 8,
      tue: '',
    });
  });
});

describe('parseInboundTexts', () => {
  const now = instant('2026-09-18T17:00:00');

  test('junk entries, senders without a number and bodiless texts are handled', () => {
    const texts = parseInboundTexts(
      {
        messages: [
          null,
          'x',
          { type: 'text', from: '' },
          { type: 'text', from: '1', timestamp: '-5' },
        ],
      },
      now,
    );
    expect(texts).toEqual([{ id: '', phone: '1', body: '', receivedAt: now }]);
  });
});

describe('localNow', () => {
  test('refuses an invalid clock rather than writing a bad key', () => {
    vi.stubGlobal('$now', { setZone: () => DateTime.invalid('broken clock') });
    expect(() => localNow()).toThrow(/broken clock/);
    vi.unstubAllGlobals();
  });
});
