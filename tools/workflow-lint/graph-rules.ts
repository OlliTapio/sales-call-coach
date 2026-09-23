/** @file Rules on the shape of the graph: ids, names, connections, references, lanes. */
import type { WorkflowNode } from '../build/workflow-file.ts';
import { eachNode, finding, type Rule } from './rule.ts';

const TRIGGERS = new Set(['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.telegramTrigger']);
const STICKY = 'n8n-nodes-base.stickyNote';
const MAX_STICKY_GAP = 400;

const hasWorkflowId: Rule = {
  id: 'has-workflow-id',
  check: (wf) =>
    typeof wf.id === 'string' && wf.id.length > 0 && wf.id.length <= 36
      ? []
      : [
          finding(
            'has-workflow-id',
            null,
            'Give the workflow a fixed `id` (≤36 chars); `n8n import:workflow` needs one.',
          ),
        ],
};

const uniqueNamesAndIds: Rule = {
  id: 'unique-names-and-ids',
  check: (wf) => {
    const dupes = (values: readonly string[]) => values.filter((v, i) => values.indexOf(v) !== i);
    return [
      ...dupes(wf.nodes.map((n) => n.name)).map((n) =>
        finding('unique-names-and-ids', n, 'Node name is used twice.'),
      ),
      ...dupes(wf.nodes.map((n) => n.id)).map((id) =>
        finding('unique-names-and-ids', null, `Node id ${id} is used twice.`),
      ),
    ];
  },
};

const connectionsResolve: Rule = {
  id: 'connections-resolve',
  check: (wf) => {
    const names = new Set(wf.nodes.map((n) => n.name));
    return Object.entries(wf.connections).flatMap(([source, kinds]) => [
      ...(names.has(source)
        ? []
        : [
            finding(
              'connections-resolve',
              source,
              'Connection from a node that does not exist; was it renamed?',
            ),
          ]),
      ...Object.entries(kinds).flatMap(([kind, outputs]) =>
        outputs
          .flat()
          .flatMap((c) => [
            ...(names.has(c.node)
              ? []
              : [finding('connections-resolve', source, `Connects to unknown node "${c.node}".`)]),
            ...(c.type === kind
              ? []
              : [
                  finding(
                    'connections-resolve',
                    source,
                    `Connection to "${c.node}" has type ${c.type}, expected ${kind}.`,
                  ),
                ]),
          ]),
      ),
    ]);
  },
};

const nodeRefsResolve: Rule = {
  id: 'node-refs-resolve',
  check: (wf) => {
    const names = new Set(wf.nodes.map((n) => n.name));
    return eachNode(wf, (node) =>
      [...JSON.stringify(node.parameters).matchAll(/\$\((?:'([^']+)'|\\"((?:[^"\\]|\\.)+)\\")\)/g)]
        .map((m) => m[1] ?? m[2] ?? '')
        .filter((ref) => !names.has(ref))
        .map((ref) =>
          finding('node-refs-resolve', node.name, `$('${ref}') names a node that does not exist.`),
        ),
    );
  },
};

const noOrphans: Rule = {
  id: 'no-orphans',
  check: (wf) => {
    const targets = new Set(
      Object.values(wf.connections).flatMap((k) =>
        Object.values(k)
          .flat(2)
          .map((c) => c.node),
      ),
    );
    const subNodes = new Set(
      Object.entries(wf.connections)
        .filter(([, kinds]) => Object.keys(kinds).some((k) => k !== 'main'))
        .map(([source]) => source),
    );
    return wf.nodes
      .filter((n) => !TRIGGERS.has(n.type) && n.type !== STICKY)
      .filter((n) => !targets.has(n.name) && !subNodes.has(n.name))
      .map((n) =>
        finding('no-orphans', n.name, 'Nothing connects to this node; wire it up or delete it.'),
      );
  },
};

const position = (n: WorkflowNode): readonly [number, number] => {
  const [x = 0, y = 0] = Array.isArray(n['position']) ? (n['position'] as number[]) : [];
  return [x, y];
};

const stickyNotePerLane: Rule = {
  id: 'sticky-note-per-lane',
  check: (wf) => {
    const notes = wf.nodes.filter((n) => n.type === STICKY);
    return wf.nodes
      .filter((n) => TRIGGERS.has(n.type))
      .filter((trigger) => {
        const [tx, ty] = position(trigger);
        return !notes.some((note) => {
          const [nx, ny] = position(note);
          const width = Number(note.parameters['width']);
          return tx >= nx && tx <= nx + width && ty - ny >= 0 && ty - ny <= MAX_STICKY_GAP;
        });
      })
      .map((t) =>
        finding(
          'sticky-note-per-lane',
          t.name,
          'Every lane starts with a sticky note explaining it; add one above this trigger.',
        ),
      );
  },
};

export const GRAPH_RULES: readonly Rule[] = [
  hasWorkflowId,
  uniqueNamesAndIds,
  connectionsResolve,
  nodeRefsResolve,
  noOrphans,
  stickyNotePerLane,
];
