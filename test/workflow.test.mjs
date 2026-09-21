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

test('every $(\'node\') expression names a node that exists', () => {
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

test('both templates the README documents are the ones the workflow sends', () => {
  const sent = new Set(wf.nodes.map((n) => n.parameters.template).filter(Boolean));
  assert.deepEqual([...sent].sort(), ['daily_sales_goal|en', 'daily_sales_nudge|en']);
});

test('the nudge falls back to a template when the model cannot write one', () => {
  const chain = wf.nodes.find((n) => n.name === 'Write the nudge');
  assert.equal(chain.onError, 'continueErrorOutput');
  const [ok, err] = wf.connections['Write the nudge'].main;
  assert.deepEqual(ok.map((c) => c.node), ['Tidy the nudge']);
  assert.deepEqual(err.map((c) => c.node), ['Nudge by template'], 'error output must reach a sendable path');
});

test('the closed-window branch of the nudge uses a template, not free text', () => {
  const [open, closed] = wf.connections['Can we message freely?'].main;
  assert.deepEqual(open.map((c) => c.node), ['Write the nudge']);
  assert.deepEqual(closed.map((c) => c.node), ['Nudge by template']);
  const tmpl = wf.nodes.find((n) => n.name === 'Nudge by template');
  assert.equal(tmpl.parameters.operation, 'sendTemplate');
});

test('one model node backs both AI steps', () => {
  const targets = wf.connections['Claude'].ai_languageModel.flat().map((c) => c.node);
  assert.deepEqual(targets.sort(), ['Read it with Claude', 'Write the nudge']);
});

test('the model branch degrades instead of dropping the answer', () => {
  const extractor = wf.nodes.find((n) => n.name === 'Read it with Claude');
  assert.equal(extractor.onError, 'continueErrorOutput');
  const [, errorBranch] = wf.connections['Read it with Claude'].main;
  assert.deepEqual(errorBranch.map((t) => t.node), ['Ask for a plain number']);
});

test('the roster is read once per reply, not once per message', () => {
  const roster = wf.nodes.find((n) => n.name === 'Get the roster (reply)');
  assert.equal(roster.executeOnce, true);
});

test('status-only webhooks do not wake the reply workflow', () => {
  const trigger = wf.nodes.find((n) => n.name === 'WhatsApp Trigger');
  assert.deepEqual(trigger.parameters.updates, ['messages']);
  assert.deepEqual(trigger.parameters.options.messageStatusUpdates, []);
});

test('every write to the Log tab upserts on the same key', () => {
  for (const name of ['Log the goal', 'Log the nudge', 'Record the answer']) {
    const node = wf.nodes.find((n) => n.name === name);
    assert.equal(node.parameters.operation, 'appendOrUpdate');
    assert.deepEqual(node.parameters.columns.matchingColumns, ['key']);
    assert.equal(node.parameters.sheetName.value, 'Log');
  }
});

test('the README quotes the right number of nodes per placeholder', () => {
  const count = (type) => wf.nodes.filter((n) => n.type === type).length;
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, new RegExp(`on all eight Sheets nodes`));
  assert.equal(count('n8n-nodes-base.googleSheets'), 8);
  assert.match(readme, new RegExp(`on all six WhatsApp nodes`));
  assert.equal(count('n8n-nodes-base.whatsApp'), 6);
});

test('every placeholder is spelled the way the README says', () => {
  const found = new Set([...JSON.stringify(wf).matchAll(/REPLACE_WITH_[A-Z_]+/g)].map((m) => m[0]));
  assert.deepEqual([...found].sort(), [
    'REPLACE_WITH_COACH_WHATSAPP_NUMBER',
    'REPLACE_WITH_PHONE_NUMBER_ID',
    'REPLACE_WITH_SPREADSHEET_ID',
  ]);
});

test('the shape the README describes is the shape on the canvas', () => {
  const count = (type) => wf.nodes.filter((n) => n.type === type).length;
  const sticky = count('n8n-nodes-base.stickyNote');
  assert.equal(wf.nodes.length - sticky, 33, 'README says thirty-three nodes');
  assert.equal(sticky, 4, 'README says four sticky notes');
  assert.equal(count('n8n-nodes-base.googleSheets'), 8, 'README says eight Sheets nodes');
  assert.equal(count('n8n-nodes-base.whatsApp'), 6, 'README says six WhatsApp nodes');
});

test('no credentials were exported with the workflow', () => {
  for (const node of wf.nodes) {
    assert.equal(node.credentials, undefined, `${node.name} carries a credential reference`);
  }
});
