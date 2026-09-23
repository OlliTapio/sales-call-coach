// Structural checks on the exported workflow. These are the mistakes that only
// surface after you import into n8n and press Execute: a connection to a node
// that was renamed, an expression pointing at a node that no longer exists, a
// placeholder that shipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWorkflow, drift } from '../sync-code.mjs';

const wf = readWorkflow();
const names = new Set(wf.nodes.map((n) => n.name));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

test('code/ and workflow.json have not drifted apart', () => {
  assert.deepEqual(drift(), []);
});

test('the workflow carries an id, so `n8n import:workflow` works', () => {
  // The UI generates an id on import; the CLI writes straight to a NOT NULL
  // column and fails with a SQLITE_CONSTRAINT error without one.
  assert.equal(typeof wf.id, 'string');
  assert.ok(wf.id.length > 0 && wf.id.length <= 36);
});

test('node names and ids are unique', () => {
  assert.equal(names.size, wf.nodes.length);
  assert.equal(new Set(wf.nodes.map((n) => n.id)).size, wf.nodes.length);
});

test('every connection points at a node that exists', () => {
  for (const [src, kinds] of Object.entries(wf.connections)) {
    assert.ok(names.has(src), `connection from unknown node ${src}`);
    for (const [kind, outputs] of Object.entries(kinds)) {
      for (const targets of outputs) {
        for (const t of targets) {
          assert.ok(names.has(t.node), `${src} -> unknown node ${t.node}`);
          assert.equal(t.type, kind, `${src} -> ${t.node} has the wrong connection type`);
        }
      }
    }
  }
});

test("every $('node') expression names a node that exists", () => {
  const refs = new Set([...JSON.stringify(wf).matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  for (const ref of refs) assert.ok(names.has(ref), `expression references unknown node ${ref}`);
});

test('every node is reachable from a trigger or attached as a sub-node', () => {
  const STANDALONE = new Set([
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.whatsAppTrigger',
    'n8n-nodes-base.stickyNote',
  ]);
  const targets = new Set(
    Object.values(wf.connections).flatMap((kinds) =>
      Object.values(kinds).flat(2).map((t) => t.node)));
  const subNodes = new Set(
    Object.entries(wf.connections)
      .filter(([, kinds]) => Object.keys(kinds).some((k) => k !== 'main'))
      .map(([src]) => src));

  for (const node of wf.nodes) {
    if (STANDALONE.has(node.type)) continue;
    assert.ok(targets.has(node.name) || subNodes.has(node.name), `${node.name} is orphaned`);
  }
});

test('expressions have balanced braces', () => {
  const walk = (value, path) => {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    } else if (typeof value === 'string' && value.startsWith('=')) {
      assert.equal(value.split('{{').length, value.split('}}').length, `unbalanced at ${path}`);
    }
  };
  for (const node of wf.nodes) walk(node.parameters, node.name);
});

// ---------------------------------------------------------------------------
// The split that the whole design rests on
// ---------------------------------------------------------------------------

test('the regex owns the log; the agent only sees what it could not read', () => {
  const [read, unread] = wf.connections['Did the regex read it?'].main;
  assert.deepEqual(read.map((t) => t.node), ['Record the day']);
  assert.deepEqual(unread.map((t) => t.node), ['Coach']);
});

test('a plain number never reaches a model', () => {
  // Record the day is fed by the IF and nothing else, so there is no path from
  // the agent into the deterministic write.
  const feeds = Object.entries(wf.connections)
    .filter(([, kinds]) => (kinds.main ?? []).flat().some((t) => t.node === 'Record the day'))
    .map(([src]) => src);
  assert.deepEqual(feeds, ['Did the regex read it?']);
});

test('every write to the Days tab upserts on the same key', () => {
  for (const name of ['Log the goals', 'Record the day', 'log_the_day']) {
    const node = byName[name];
    assert.equal(node.parameters.operation, 'appendOrUpdate');
    assert.deepEqual(node.parameters.columns.matchingColumns, ['key']);
    assert.equal(node.parameters.sheetName.value, 'Days');
  }
});

test('the agent may fill in numbers but not the row it writes them to', () => {
  // key, date, phone and the targets are expressions off the item; only the
  // three cells the person actually spoke about come from the model.
  const columns = byName.log_the_day.parameters.columns.value;
  const fromModel = Object.entries(columns)
    .filter(([, v]) => String(v).includes('$fromAI'))
    .map(([k]) => k)
    .sort();
  assert.deepEqual(fromModel, ['calls', 'hours', 'note']);
  assert.match(columns.key, /^=\{\{ \$json\.key \}\}$/);
});

// ---------------------------------------------------------------------------
// The agent cluster
// ---------------------------------------------------------------------------

test('the agent has exactly one model, one memory and two tools', () => {
  const attached = (kind) => Object.entries(wf.connections)
    .filter(([, kinds]) => kind in kinds)
    .filter(([, kinds]) => kinds[kind].flat().some((t) => t.node === 'Coach'))
    .map(([src]) => src)
    .sort();

  assert.deepEqual(attached('ai_languageModel'), ['Claude']);
  assert.deepEqual(attached('ai_memory'), ['Remember the thread']);
  assert.deepEqual(attached('ai_tool'), ['log_the_day', 'read_the_playbooks']);
});

test('the tool node names are the names the system prompt calls', () => {
  const prompt = byName.Coach.parameters.options.systemMessage;
  for (const tool of ['log_the_day', 'read_the_playbooks']) {
    assert.ok(names.has(tool), `no node named ${tool}`);
    assert.match(prompt, new RegExp(tool), `the system prompt never mentions ${tool}`);
  }
});

test('each person gets their own memory, not a shared one', () => {
  const memory = byName['Remember the thread'];
  assert.equal(memory.parameters.sessionIdType, 'customKey');
  assert.match(memory.parameters.sessionKey, /\$json\.phone/);
});

test('streaming is off, because nothing here is a chat trigger', () => {
  assert.equal(byName.Coach.parameters.options.enableStreaming, false);
});

test('the agent degrades instead of dropping the reply', () => {
  const agent = byName.Coach;
  assert.equal(agent.onError, 'continueErrorOutput');
  const [ok, err] = wf.connections.Coach.main;
  assert.deepEqual(ok.map((t) => t.node), ['Tidy the coach reply']);
  assert.deepEqual(err.map((t) => t.node), ['Tidy the coach reply'],
    'the error output must reach a sendable path');
});

test('the fallback asks for the one thing the regex can still read', () => {
  const set = byName['Tidy the coach reply'];
  const [assignment] = set.parameters.assignments.assignments;
  assert.match(assignment.value, /\$json\.output/);
  assert.match(assignment.value, /how many calls/i);
});

test('the playbooks are read whole, and a Notion outage does not stop the coach', () => {
  const notion = byName.read_the_playbooks;
  assert.equal(notion.parameters.resource, 'databasePage');
  assert.equal(notion.parameters.operation, 'getAll');
  assert.equal(notion.parameters.returnAll, true);
  // Read whole because the library is a few dozen rows, not because Notion
  // cannot filter it — a database query does support property conditions, and
  // filtering on Focus is on the TODO note. Do not restate the title-only
  // limitation of the *search* endpoint here; it is a different endpoint.
  assert.equal(notion.parameters.filterType, 'none');
  assert.equal(notion.onError, 'continueRegularOutput');
  assert.equal(notion.alwaysOutputData, true);
});

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

test('the people list is read once per reply, not once per message', () => {
  assert.equal(byName['Get the people (reply)'].executeOnce, true);
});

test('the three Days writes map the same columns as the sheet itself', () => {
  // The 14-column map is written out three times in workflow.json and once
  // more as the CSV header. Adding a column to one of them and not the others
  // would otherwise ship green.
  const header = readFileSync(new URL('../sheets/Days.csv', import.meta.url), 'utf8')
    .split(/\r?\n/)[0].trim().split(',');

  for (const name of ['Log the goals', 'Record the day', 'log_the_day']) {
    assert.deepEqual(
      Object.keys(byName[name].parameters.columns.value).sort(),
      [...header].sort(),
      `${name} does not map the Days columns`);
  }
});

test('every node that could carry a real id carries the placeholder instead', () => {
  // Counting node types is not enough: one spreadsheet id pasted in during
  // debugging would ship with every other check green.
  for (const node of wf.nodes) {
    const json = JSON.stringify(node.parameters);
    if (node.type.startsWith('n8n-nodes-base.googleSheets')) {
      assert.match(json, /REPLACE_WITH_SPREADSHEET_ID/, `${node.name} has a real spreadsheet id`);
    }
    if (node.type === 'n8n-nodes-base.whatsApp') {
      assert.match(json, /REPLACE_WITH_PHONE_NUMBER_ID/, `${node.name} has a real phone number id`);
    }
    if (node.type.startsWith('n8n-nodes-base.notion')) {
      assert.match(json, /REPLACE_WITH_NOTION_DATA_SOURCE_ID/, `${node.name} has a real Notion id`);
    }
  }
});

test('status-only webhooks do not wake the reply workflow', () => {
  const trigger = byName['WhatsApp Trigger'];
  assert.deepEqual(trigger.parameters.updates, ['messages']);
  assert.deepEqual(trigger.parameters.options.messageStatusUpdates, []);
});

test('the memory defect stays written down where someone importing this will see it', () => {
  // A known defect that is only in a commit message is a defect nobody knows
  // about. It has to survive on the canvas and in the README.
  const note = wf.nodes.find((n) =>
    n.type === 'n8n-nodes-base.stickyNote' && /## Known defects/.test(n.parameters.content));
  assert.ok(note, 'no Known defects sticky on the canvas');
  assert.match(note.parameters.content, /Remember the thread/);
  assert.match(note.parameters.content, /60 minutes/);

  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /## Known defects/);
  assert.match(readme, /Simple Memory/);
});

test('no credentials are exported', () => {
  assert.equal(JSON.stringify(wf).includes('"credentials"'), false);
});

test('every placeholder is spelled the way the README says', () => {
  const found = new Set([...JSON.stringify(wf).matchAll(/REPLACE_WITH_[A-Z_]+/g)].map((m) => m[0]));
  assert.deepEqual([...found].sort(), [
    'REPLACE_WITH_NOTION_DATA_SOURCE_ID',
    'REPLACE_WITH_PHONE_NUMBER_ID',
    'REPLACE_WITH_SPREADSHEET_ID',
  ]);
});

test('the shape the README describes is the shape on the canvas', () => {
  const count = (type) => wf.nodes.filter((n) => n.type === type).length;
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  const stickies = count('n8n-nodes-base.stickyNote');
  assert.equal(wf.nodes.length - stickies, 19, 'README says nineteen nodes');
  assert.equal(stickies, 5, 'README says five sticky notes');

  assert.match(readme, /on all five Sheets nodes/);
  assert.equal(count('n8n-nodes-base.googleSheets') + count('n8n-nodes-base.googleSheetsTool'), 5);
  assert.match(readme, /on all three WhatsApp nodes/);
  assert.equal(count('n8n-nodes-base.whatsApp'), 3);
});
