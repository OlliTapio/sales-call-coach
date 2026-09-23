/** @file Code node "Build the chart": Weekly rows in, one Chart.js config plus caption out. */
import { parseWeeklyRow } from '../adapters/sheets.ts';
import { toItems, type Item } from '../n8n/item.ts';
import { isPresent } from '../shared/collections.ts';
import { weeklyReport, type WeeklyReport } from '../views/weekly-chart.ts';

export const main = (): Item<WeeklyReport>[] => {
  const reps = $input
    .all()
    .map((item) => parseWeeklyRow(item.json))
    .filter(isPresent);
  return toItems(weeklyReport(reps));
};
