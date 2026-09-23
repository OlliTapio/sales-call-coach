import { DateTime } from 'luxon';
import { describe, expect, test, vi } from 'vitest';
import { parseInboundTexts } from '../../src/adapters/whatsapp.ts';
import { parseCheckIn } from '../../src/domain/reply.ts';
import { localNow } from '../../src/n8n/clock.ts';
import { toNumberOrZero, toText } from '../../src/shared/coerce.ts';
import type { Instant } from '../../src/shared/time.ts';
import { at } from '../support/n8n-sandbox.ts';

vi.stubGlobal('DateTime', DateTime);

const instant = (iso: string): Instant => {
  const value = at(iso);
  if (!value.isValid) throw new Error(iso);
  return value;
};

describe('coerce', () => {
  test('non-scalar cells read as empty text, booleans as their word', () => {
    expect(toText({ a: 1 })).toBe('');
    expect(toText(true)).toBe('true');
  });

  test('blank and junk numbers read as zero', () => {
    expect(['', 'x', null, undefined, '3', 2.5].map(toNumberOrZero)).toEqual([0, 0, 0, 0, 3, 2.5]);
  });
});

describe('parseCheckIn', () => {
  test('a four-digit number is not a count', () => {
    expect(parseCheckIn('1234', 8)).toEqual({ kind: 'unparsed' });
  });

  test('a pair with too many hours is refused, not truncated', () => {
    expect(parseCheckIn('6/19', 8)).toEqual({ kind: 'unparsed' });
  });
});

describe('parseInboundTexts', () => {
  const now = instant('2026-09-21T19:00:00');

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
