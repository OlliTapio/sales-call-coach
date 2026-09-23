import { describe, expect, test } from 'vitest';
import { bundleNode } from '../../tools/build/bundle.ts';
import { buildWorkflow } from '../../tools/build/build-nodes.ts';
import { readWorkflow, readWorkflowText, serialize } from '../../tools/build/workflow-file.ts';

describe('build', () => {
  test('workflow.json is exactly what `npm run build` produces from src/nodes', async () => {
    const committed = readWorkflow();
    const built = await buildWorkflow(committed);
    const stale = built.nodes
      .filter((node, i) => JSON.stringify(node) !== JSON.stringify(committed.nodes[i]))
      .map((node) => `${node.name} is stale; run \`npm run build\``);
    expect(stale).toEqual([]);
    expect(serialize(built)).toBe(readWorkflowText());
  });

  test('a body is self-contained and ends by returning the items', async () => {
    const body = await bundleNode('set-todays-goals');
    expect(body).toMatch(/^\/\/ Generated from src\/nodes\/set-todays-goals\.ts/);
    expect(body).toMatch(/\nreturn main\(\);$/);
    expect(body).not.toMatch(/\bimport\b|\brequire\(/);
  });

  test('a Code node missing from the canvas is an error, not a silent skip', async () => {
    const workflow = readWorkflow();
    const without = {
      ...workflow,
      nodes: workflow.nodes.filter((n) => n.name !== 'Match person & parse reply'),
    };
    await expect(buildWorkflow(without)).rejects.toThrow(/Match person & parse reply/);
  });

  test('an entry that does not export main is refused', async () => {
    await expect(bundleNode('../n8n/item')).rejects.toThrow(/export exactly one function/);
  });
});
