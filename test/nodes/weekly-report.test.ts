import { describe, expect, test } from 'vitest';
import { RUNNERS, at } from '../support/n8n-sandbox.ts';

const LOG = (
  [
    ['2026-09-14', 'Anna', '358401234567', 8, 8],
    ['2026-09-15', 'Anna', '358401234567', 8, 6],
    ['2026-09-16', 'Anna', '358401234567', 8, ''],
    ['2026-09-17', 'Anna', '358401234567', 8, 9],
    ['2026-09-18', 'Anna', '358401234567', 8, 4],
    ['2026-09-14', 'Mikko', '358401234568', 10, 3],
    ['2026-09-11', 'Anna', '358401234567', 8, 8],
    ['not-a-date', 'Junk', '358401234567', 8, 5],
  ] as const
).map(([date, name, phone, target, calls]) => ({
  key: `${date}|${phone}`,
  date,
  name,
  phone,
  target,
  calls,
}));

describe.each(RUNNERS)('Aggregate the week (%s)', (_, run) => {
  const weekly = run('Aggregate the week', { items: LOG, now: at('2026-09-18T17:00:00') });
  const anna = weekly[0];

  test('one row per rep, best week first', () => {
    expect(weekly.map((r) => r['name'])).toEqual(['Anna', 'Mikko']);
  });

  test('rows outside the current week and unparseable dates are excluded', () => {
    expect(anna).toMatchObject({ calls: 8 + 6 + 9 + 4, asked: 5 });
  });

  test('asked and answered are counted separately', () => {
    expect(anna).toMatchObject({ asked: 5, answered: 4 });
  });

  test('a silent day stays blank instead of becoming a zero', () => {
    expect(anna?.['wed']).toBe('');
  });

  test('hitting or beating the target counts as a hit day', () => {
    expect(anna?.['hit_days']).toBe(2);
  });

  test('days are spread into columns for the spreadsheet chart', () => {
    expect(anna).toMatchObject({ mon: 8, fri: 4 });
  });

  test('percentage is measured against the days actually asked', () => {
    expect(anna?.['pct_of_target']).toBe(Math.round((27 / 40) * 100));
  });

  test('the composite id makes re-running the report idempotent', () => {
    expect(anna).toMatchObject({ id: '2026-W38|358401234567', week_starting: '2026-09-14' });
  });

  describe('Build the chart', () => {
    const [report] = run('Build the chart', { items: weekly });

    test('one item carries the config and the caption', () => {
      expect(run('Build the chart', { items: weekly })).toHaveLength(1);
    });

    test('the config survives JSON.stringify (QuickChart gets JSON, not functions)', () => {
      expect(JSON.parse(JSON.stringify(report?.['chart']))).toEqual(report?.['chart']);
    });

    test('the value rides on the axis label, where a 0-call rep can still show it', () => {
      expect(report).toMatchObject({
        chart: {
          data: {
            labels: [
              ['Anna', '27 of 40'],
              ['Mikko', '3 of 10'],
            ],
          },
          options: { plugins: { datalabels: { display: false } } },
        },
      });
    });

    test('the track segment is the shortfall and never goes negative', () => {
      expect(report).toMatchObject({
        chart: { data: { datasets: [{ data: [27, 3] }, { data: [13, 7] }] } },
      });
      const [over] = run('Build the chart', { items: [{ ...anna, calls: 50, target_total: 40 }] });
      expect(over).toMatchObject({ chart: { data: { datasets: [{}, { data: [0] }] } } });
    });

    test('both segments share one axis, with a legend for the two series', () => {
      expect(report).toMatchObject({
        chart: {
          options: {
            legend: { position: 'bottom' },
            scales: { xAxes: [{ stacked: true }], yAxes: [{ stacked: true }] },
          },
        },
      });
    });

    test('bar geometry is on the dataset, which is where Chart.js 2.9 wants it', () => {
      const geometry = { barPercentage: 0.62 };
      expect(report).toMatchObject({ chart: { data: { datasets: [geometry, geometry] } } });
      expect(report).not.toMatchObject({ chart: { options: { scales: { yAxes: [geometry] } } } });
    });

    test('the canvas grows with the roster', () => {
      expect(report?.['height']).toBe(150 + 2 * 58);
    });

    test('the caption calls out silent days', () => {
      expect(report?.['summary']).toMatch(
        /Anna: 27\/40 \(68%\) · hit target 2\/5 days, 1 day silent/,
      );
      expect(report?.['summary']).toMatch(/Mikko: 3\/10 \(30%\) · hit target 0\/1 days$/);
    });

    test('an empty week sends nothing at all', () => {
      expect(run('Build the chart', { items: [] })).toHaveLength(0);
    });
  });
});
