/** @file `npm run lint:workflow`: exit 1 with one line per finding. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWorkflow, ROOT } from '../build/workflow-file.ts';
import { format, lintWorkflow, RULES } from './lint.ts';

const findings = lintWorkflow(readWorkflow(), readFileSync(join(ROOT, 'README.md'), 'utf8'));

if (findings.length === 0) {
  console.log(`workflow.json passes ${String(RULES.length)} rules`);
} else {
  console.error(findings.map(format).join('\n'));
  console.error(`\n${String(findings.length)} workflow lint finding(s).`);
  process.exitCode = 1;
}
