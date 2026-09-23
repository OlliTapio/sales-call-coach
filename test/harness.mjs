// Runs a Code-node body the way n8n runs it: the file is the function body,
// $input / $now / DateTime / $() are globals, and the return value is the
// item array. That lets the same file be pasted into n8n unchanged.
import { DateTime } from 'luxon';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CODE_DIR = new URL('../code/', import.meta.url);

export function runCode(file, { items = [], nodes = {}, now } = {}) {
  // fileURLToPath, not the URL's pathname: on Windows that starts `/C:/` and
  // joining it produces `C:\C:\...`, so the tests could only ever run on CI.
  const src = fs.readFileSync(fileURLToPath(new URL(file, CODE_DIR)), 'utf8');

  const $input = { all: () => items.map((json) => ({ json })) };
  const $now = now ?? DateTime.now().setZone('Europe/Helsinki');
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`test asked for node ${name}, which was not stubbed`);
    return { all: () => nodes[name].map((json) => ({ json })) };
  };

  return new Function('$input', '$now', '$', 'DateTime', src)($input, $now, $, DateTime);
}

export { DateTime };
