/**
 * @file Compiles one `src/nodes/<entry>.ts` into an n8n Code-node body: a flat, readable
 * function body whose last statement is `return main();`.
 */
import { build } from 'esbuild';
import { join } from 'node:path';
import { ROOT } from './workflow-file.ts';

const TRAILING_EXPORT = /\nexport \{\n {2}main\n\};\n$/;
const MAX_BODY_BYTES = 20_000;

const banner = (entry: string): string =>
  `// Generated from src/nodes/${entry}.ts by \`npm run build\`. Edit the source, not this node.`;

const assertSelfContained = (entry: string, body: string): void => {
  if (/\brequire\(|^\s*import\s/m.test(body)) {
    throw new Error(
      `${entry}: the bundle still imports something; src/ must not have runtime deps`,
    );
  }
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    throw new Error(
      `${entry}: body is over ${String(MAX_BODY_BYTES)} bytes; a dependency leaked in`,
    );
  }
};

export const bundleNode = async (entry: string): Promise<string> => {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: [join('src', 'nodes', `${entry}.ts`)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'silent',
  });
  const text = result.outputFiles[0]?.text ?? '';
  if (!TRAILING_EXPORT.test(text)) {
    throw new Error(`${entry}: expected the entry to export exactly one function, \`main\``);
  }
  const body = `${banner(entry)}\n${text.replace(TRAILING_EXPORT, '\nreturn main();')}`;
  assertSelfContained(entry, body);
  return body;
};
