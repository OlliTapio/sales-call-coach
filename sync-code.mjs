// code/*.js is the source of truth for the Code nodes; workflow.json is
// what n8n imports. This splices one into the other so they cannot drift.
//
//   node sync-code.mjs          write code/*.js into workflow.json
//   node sync-code.mjs --check  fail if they differ (this is what the test does)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CODE_NODES = {
  "Set today's goals": 'set-todays-goals.js',
  'Match person & parse reply': 'match-person-and-parse-reply.js',
};

const WORKFLOW = new URL('./workflow.json', import.meta.url);
const CODE = new URL('./code/', import.meta.url);

export function readWorkflow() {
  return JSON.parse(fs.readFileSync(WORKFLOW, 'utf8'));
}

export function readCode(file) {
  return fs.readFileSync(new URL(file, CODE), 'utf8').replace(/\n+$/, '');
}

export function drift() {
  const byName = Object.fromEntries(readWorkflow().nodes.map((n) => [n.name, n]));
  const out = [];
  for (const [name, file] of Object.entries(CODE_NODES)) {
    const node = byName[name];
    if (!node) { out.push(`${name}: no such node in workflow.json`); continue; }
    if (node.parameters.jsCode !== readCode(file)) out.push(`${name}: differs from code/${file}`);
  }
  return out;
}

// pathToFileURL, not a template string: on Windows argv[1] is a drive path and
// the naive `file://C:\...` never matches, so the CLI silently did nothing.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  if (check) {
    const problems = drift();
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    console.log('workflow.json is in sync with code/');
  } else {
    const wf = readWorkflow();
    for (const node of wf.nodes) {
      const file = CODE_NODES[node.name];
      if (file) node.parameters.jsCode = readCode(file);
    }
    fs.writeFileSync(WORKFLOW, JSON.stringify(wf, null, 2) + '\n');
    console.log('wrote workflow.json');
  }
}
