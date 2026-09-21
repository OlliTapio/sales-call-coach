// Weekly rows in, one Chart.js config plus a caption out.
//
// Form: a horizontal progress-to-goal bar, one row per rep — calls made, then
// the remainder of the target as a recessive track. It is the only shape that
// stays readable on a phone as the roster grows, and the bar length answers the
// coach's actual question ("who is short, and by how much") without a second axis.
// The per-day detail is not thrown away: it goes to the Weekly tab, where the
// client can chart it themselves.
const reps = $input.all().map((item) => item.json);
if (reps.length === 0) return [];

const CALLS_MADE = '#2a78d6';  // categorical slot 1
const TO_TARGET = '#cfd0cb';   // a track, not a series — deliberately recessive
const INK = '#52514e';
const INK_STRONG = '#0b0b0b';
const GRID = '#ececea';

const week = reps[0].week;

const chart = {
  type: 'horizontalBar',
  data: {
    // The value rides in the axis label rather than inside the bar: a rep on 0 or
    // 1 calls has no bar to write in, and that is exactly the rep you need to read.
    labels: reps.map((rep) => [rep.name, `${rep.calls} of ${rep.target_total}`]),
    datasets: [
      {
        label: 'Calls made',
        backgroundColor: CALLS_MADE,
        data: reps.map((rep) => rep.calls),
        // A 2px surface-coloured edge reads as a gap between the segments.
        borderColor: '#ffffff',
        borderWidth: 2,
        barPercentage: 0.62,
        categoryPercentage: 0.8,
      },
      {
        label: 'Still to target',
        backgroundColor: TO_TARGET,
        data: reps.map((rep) => Math.max(0, rep.target_total - rep.calls)),
        borderColor: '#ffffff',
        borderWidth: 2,
        barPercentage: 0.62,
        categoryPercentage: 0.8,
      },
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
    // QuickChart auto-registers chartjs-plugin-datalabels, which would print a
    // number inside every segment. The values are already on the axis, and a
    // rep on 0 calls has no segment to print into.
    plugins: { datalabels: { display: false } },
    layout: { padding: { left: 8, right: 24, top: 0, bottom: 8 } },
    scales: {
      xAxes: [{
        stacked: true,
        ticks: { beginAtZero: true, fontColor: INK },
        gridLines: { color: GRID, zeroLineColor: GRID, drawBorder: false },
        scaleLabel: { display: true, labelString: 'Calls', fontColor: INK },
      }],
      yAxes: [{
        stacked: true,
        ticks: { fontColor: INK_STRONG },
        gridLines: { display: false, drawBorder: false },
      }],
    },
  },
};

const lines = reps.map((rep) => {
  const silent = rep.asked - rep.answered;
  const tail = silent > 0 ? `, ${silent} day${silent === 1 ? '' : 's'} silent` : '';
  return `${rep.name}: ${rep.calls}/${rep.target_total} (${rep.pct_of_target}%) · hit target ${rep.hit_days}/${rep.asked} days${tail}`;
});

return [{
  json: {
    week,
    chart,
    height: 150 + reps.length * 58,
    summary: `Sales calls — week ${week}\n\n${lines.join('\n')}`,
  },
}];
