/** @file What the README and the canvas promise each other: placeholders, counts, known defects. */
import type { Workflow } from '../build/workflow-file.ts';
import { expectations, same } from './expect.ts';
import type { Rule } from './rule.ts';

const PLACEHOLDERS = [
  'REPLACE_WITH_NOTION_DATA_SOURCE_ID',
  'REPLACE_WITH_PHONE_NUMBER_ID',
  'REPLACE_WITH_SPREADSHEET_ID',
];

/** Every node of these types must carry the placeholder, not a real id. */
const PLACEHOLDER_BY_TYPE: readonly (readonly [string, string])[] = [
  ['n8n-nodes-base.googleSheets', 'REPLACE_WITH_SPREADSHEET_ID'],
  ['n8n-nodes-base.googleSheetsTool', 'REPLACE_WITH_SPREADSHEET_ID'],
  ['n8n-nodes-base.whatsApp', 'REPLACE_WITH_PHONE_NUMBER_ID'],
  ['n8n-nodes-base.notion', 'REPLACE_WITH_NOTION_DATA_SOURCE_ID'],
  ['n8n-nodes-base.notionTool', 'REPLACE_WITH_NOTION_DATA_SOURCE_ID'],
];

const place = expectations('placeholders-match-readme');
const placeholders: Rule = {
  id: 'placeholders-match-readme',
  check: (wf, ctx) => {
    const found = [
      ...new Set([...JSON.stringify(wf).matchAll(/REPLACE_WITH_[A-Z_]+/g)].map((m) => m[0])),
    ];
    return [
      ...place.that(
        same(found, PLACEHOLDERS),
        null,
        `Placeholders are ${found.join(', ')}; expected ${PLACEHOLDERS.join(', ')}.`,
      ),
      ...PLACEHOLDERS.flatMap((p) =>
        place.that(ctx.readme.includes(p), null, `README does not mention ${p}.`),
      ),
      ...wf.nodes.flatMap((node) =>
        PLACEHOLDER_BY_TYPE.filter(([type]) => node.type === type).flatMap(([, p]) =>
          place.that(
            JSON.stringify(node.parameters).includes(p),
            node.name,
            `Carries a real id; put ${p} back before exporting.`,
          ),
        ),
      ),
    ];
  },
};

const defects = expectations('known-defects-documented');
const knownDefects: Rule = {
  id: 'known-defects-documented',
  check: (wf, ctx) => {
    const note = wf.nodes.find(
      (n) =>
        n.type === 'n8n-nodes-base.stickyNote' &&
        String(n.parameters['content']).includes('## Known defects'),
    );
    const content = String(note?.parameters['content']);
    return [
      ...defects.that(
        content.includes('Remember the thread') && content.includes('60 minutes'),
        note?.name ?? null,
        'The canvas needs a "## Known defects" sticky naming Remember the thread and its 60-minute sweep.',
      ),
      ...defects.that(
        ctx.readme.includes('## Known defects') && ctx.readme.includes('Simple Memory'),
        null,
        'The README must keep its "## Known defects" section about Simple Memory.',
      ),
    ];
  },
};

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** English words for 0–99, the way the README spells counts ("thirty-three"). */
export const inWords = (n: number): string => {
  if (n < 20) return ONES[n] ?? String(n);
  const tens = TENS[Math.floor(n / 10)];
  if (n >= 100 || tens === undefined) return String(n);
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10] ?? ''}`;
};

const count = (wf: Workflow, ...types: readonly string[]): number =>
  wf.nodes.filter((n) => types.includes(n.type)).length;

const counts = expectations('readme-counts-match-canvas');
const readmeCounts: Rule = {
  id: 'readme-counts-match-canvas',
  check: (wf, ctx) => {
    const sticky = count(wf, 'n8n-nodes-base.stickyNote');
    const claims = [
      `${inWords(wf.nodes.length - sticky)} nodes`,
      `${inWords(sticky)} sticky notes`,
      `on all ${inWords(count(wf, 'n8n-nodes-base.googleSheets', 'n8n-nodes-base.googleSheetsTool'))} Sheets nodes`,
      `on all ${inWords(count(wf, 'n8n-nodes-base.whatsApp'))} WhatsApp nodes`,
      `The ${inWords(count(wf, 'n8n-nodes-base.code'))} Code nodes`,
    ];
    const readme = ctx.readme.toLowerCase();
    return claims.flatMap((claim) =>
      counts.that(
        readme.includes(claim.toLowerCase()),
        null,
        `README should say "${claim}"; update it to match the canvas.`,
      ),
    );
  },
};

export const README_RULES: readonly Rule[] = [placeholders, knownDefects, readmeCounts];
