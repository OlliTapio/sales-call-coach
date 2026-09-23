/**
 * @file `npm run build` splices the compiled `src/nodes` into `workflow.json`.
 * `npm run build -- --check` fails instead of writing when the committed file is stale.
 */
import { bundleNode } from './bundle.ts';
import { CODE_NODES, isCodeNodeName } from './code-nodes.ts';
import {
  parseWorkflow,
  readWorkflowText,
  serialize,
  writeWorkflowText,
  type Workflow,
} from './workflow-file.ts';

const bodies = async (): Promise<ReadonlyMap<string, string>> =>
  new Map(
    await Promise.all(
      Object.entries(CODE_NODES).map(
        async ([name, entry]) => [name, await bundleNode(entry)] as const,
      ),
    ),
  );

export const buildWorkflow = async (workflow: Workflow): Promise<Workflow> => {
  const compiled = await bodies();
  const missing = Object.keys(CODE_NODES).filter(
    (name) => !workflow.nodes.some((n) => n.name === name),
  );
  if (missing.length > 0)
    throw new Error(`No such Code node in workflow.json: ${missing.join(', ')}`);
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      isCodeNodeName(node.name)
        ? { ...node, parameters: { ...node.parameters, jsCode: compiled.get(node.name) } }
        : node,
    ),
  };
};

const run = async (check: boolean): Promise<void> => {
  const current = readWorkflowText();
  const next = serialize(await buildWorkflow(parseWorkflow(current)));
  if (next === current) {
    console.log('workflow.json is up to date with src/nodes');
    return;
  }
  if (check) {
    console.error(
      'workflow.json is stale: its Code nodes differ from src/nodes. Run `npm run build`.',
    );
    process.exitCode = 1;
    return;
  }
  writeWorkflowText(next);
  console.log('wrote workflow.json');
};

if (import.meta.main) await run(process.argv.includes('--check'));
