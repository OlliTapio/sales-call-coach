/**
 * @file `local/comment-density`: caps comment blocks and the share of a file that is comments.
 * Rationale belongs in docs/; code keeps the one-line "why".
 */
import type { AST, Rule } from 'eslint';
import type * as ESTree from 'estree';

interface Options {
  readonly maxInFunction: number;
  readonly maxBlock: number;
  readonly maxRatio: number;
  readonly minLinesForRatio: number;
}

const DEFAULTS: Options = { maxInFunction: 2, maxBlock: 5, maxRatio: 0.2, minLinesForRatio: 20 };
const DIRECTIVE = /^\s*(eslint-|@ts-|global\s|prettier-ignore)/;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

interface Run {
  readonly start: ESTree.Comment;
  readonly lines: number;
  readonly endLine: number;
}

const contentLines = (comment: ESTree.Comment): number =>
  comment.value.split('\n').filter((line) => line.replace(/^\s*\*?/, '').trim() !== '').length;

const toRuns = (comments: readonly ESTree.Comment[]): readonly Run[] =>
  comments.reduce<readonly Run[]>((runs, comment) => {
    const previous = runs.at(-1);
    const startLine = comment.loc?.start.line ?? 0;
    const endLine = comment.loc?.end.line ?? 0;
    const lines = contentLines(comment);
    return previous !== undefined &&
      comment.type === 'Line' &&
      previous.start.type === 'Line' &&
      startLine === previous.endLine + 1
      ? [...runs.slice(0, -1), { start: previous.start, lines: previous.lines + lines, endLine }]
      : [...runs, { start: comment, lines, endLine }];
  }, []);

const insideFunction = (
  sourceCode: Rule.RuleContext['sourceCode'],
  comment: ESTree.Comment,
): boolean => {
  const ancestors = (node: Rule.Node | null): readonly Rule.Node[] =>
    node === null ? [] : [node, ...ancestors(node.parent)];
  const at = sourceCode.getNodeByRangeIndex(comment.range?.[0] ?? 0) as Rule.Node | null;
  return ancestors(at).some((n) => FUNCTION_TYPES.has(n.type));
};

export const commentDensity: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Limit comment block length and comment share per file' },
    schema: [
      {
        type: 'object',
        properties: {
          maxInFunction: { type: 'integer', minimum: 0 },
          maxBlock: { type: 'integer', minimum: 0 },
          maxRatio: { type: 'number', minimum: 0, maximum: 1 },
          minLinesForRatio: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      block:
        'Comment is {{lines}} lines{{where}} (max {{max}}). Keep the one-line "why"; move the rationale to docs/ARCHITECTURE.md or an ADR.',
      ratio:
        '{{percent}}% of this file is comments (max {{max}}%). Let names and types carry the meaning; move prose to docs/.',
    },
  },
  create(context) {
    const options: Options = {
      ...DEFAULTS,
      ...(context.options[0] as Partial<Options> | undefined),
    };
    const { sourceCode } = context;
    return {
      'Program:exit'(program: ESTree.Program) {
        const comments = sourceCode.getAllComments().filter((c) => !DIRECTIVE.test(c.value));
        for (const run of toRuns(comments)) {
          const inFn = insideFunction(sourceCode, run.start);
          const max = inFn ? options.maxInFunction : options.maxBlock;
          if (run.lines > max) {
            context.report({
              loc: run.start.loc as AST.SourceLocation,
              messageId: 'block',
              data: {
                lines: String(run.lines),
                where: inFn ? ' inside a function' : '',
                max: String(max),
              },
            });
          }
        }
        const codeLines = sourceCode.lines.filter((line) => line.trim() !== '').length;
        const commentLines = comments.reduce((n, c) => n + contentLines(c), 0);
        if (codeLines >= options.minLinesForRatio && commentLines / codeLines > options.maxRatio) {
          context.report({
            node: program,
            messageId: 'ratio',
            data: {
              percent: String(Math.round((commentLines / codeLines) * 100)),
              max: String(Math.round(options.maxRatio * 100)),
            },
          });
        }
      },
    };
  },
};
