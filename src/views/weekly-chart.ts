/**
 * @file The coach's Friday chart: one progress-to-goal bar per rep, as a Chart.js 2.9 config
 * for QuickChart. See README, "Two surfaces, two jobs".
 */
import type { WeeklyRow } from '../domain/model.ts';

const CALLS_MADE = '#2a78d6';
const TO_TARGET = '#cfd0cb';
const INK = '#52514e';
const INK_STRONG = '#0b0b0b';
const GRID = '#ececea';
const SEGMENT_GAP = '#ffffff';

const BASE_HEIGHT = 150;
const ROW_HEIGHT = 58;

const segment = (label: string, color: string, data: readonly number[]) =>
  ({
    label,
    backgroundColor: color,
    data,
    borderColor: SEGMENT_GAP,
    borderWidth: 2,
    barPercentage: 0.62,
    categoryPercentage: 0.8,
  }) as const;

/** The value sits in the axis label: a rep on 0 calls has no bar to write it in. */
const chartConfig = (reps: readonly WeeklyRow[], week: string) =>
  ({
    type: 'horizontalBar',
    data: {
      labels: reps.map((rep) => [rep.name, `${String(rep.calls)} of ${String(rep.target_total)}`]),
      datasets: [
        segment(
          'Calls made',
          CALLS_MADE,
          reps.map((rep) => rep.calls),
        ),
        segment(
          'Still to target',
          TO_TARGET,
          reps.map((rep) => Math.max(0, rep.target_total - rep.calls)),
        ),
      ],
    },
    options: {
      responsive: false,
      defaultFontColor: INK,
      defaultFontSize: 13,
      title: {
        display: true,
        text: `Sales calls vs. weekly target — ${week}`,
        fontColor: INK_STRONG,
        fontSize: 17,
        padding: 16,
      },
      legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
      plugins: { datalabels: { display: false } },
      layout: { padding: { left: 8, right: 24, top: 0, bottom: 8 } },
      scales: {
        xAxes: [
          {
            stacked: true,
            ticks: { beginAtZero: true, fontColor: INK },
            gridLines: { color: GRID, zeroLineColor: GRID, drawBorder: false },
            scaleLabel: { display: true, labelString: 'Calls', fontColor: INK },
          },
        ],
        yAxes: [
          {
            stacked: true,
            ticks: { fontColor: INK_STRONG },
            gridLines: { display: false, drawBorder: false },
          },
        ],
      },
    },
  }) as const;

const captionLine = (rep: WeeklyRow): string => {
  const silent = rep.asked - rep.answered;
  const tail = silent > 0 ? `, ${String(silent)} day${silent === 1 ? '' : 's'} silent` : '';
  return (
    `${rep.name}: ${String(rep.calls)}/${String(rep.target_total)} (${String(rep.pct_of_target)}%)` +
    ` · hit target ${String(rep.hit_days)}/${String(rep.asked)} days${tail}`
  );
};

export interface WeeklyReport {
  readonly week: string;
  readonly chart: ReturnType<typeof chartConfig>;
  readonly height: number;
  readonly summary: string;
}

/** An empty week sends nothing at all. */
export const weeklyReport = (reps: readonly WeeklyRow[]): readonly WeeklyReport[] => {
  const week = reps[0]?.week;
  if (week === undefined) return [];
  return [
    {
      week,
      chart: chartConfig(reps, week),
      height: BASE_HEIGHT + reps.length * ROW_HEIGHT,
      summary: `Sales calls — week ${week}\n\n${reps.map(captionLine).join('\n')}`,
    },
  ];
};
