import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { commentDensity } from '../../tools/eslint-rules/comment-density.ts';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

const lines = (n: number, prefix = '// line'): string =>
  Array.from({ length: n }, (_, i) => `${prefix} ${String(i)}`).join('\n');

const code = (n: number, from = 0): string =>
  Array.from({ length: n }, (_, i) => `export const v${String(from + i)} = ${String(i)};`).join(
    '\n',
  );

tester.run('comment-density', commentDensity, {
  valid: [
    `function f() {\n${lines(2)}\n  return 1;\n}`,
    `${lines(5)}\n${code(30)}`,
    `/**\n * @file one\n * two\n */\n${code(20)}`,
    `function f() {\n  // eslint-disable-next-line no-console -- demo\n  // why\n  // because\n  return 1;\n}`,
    { code: `${lines(8)}\n${code(3)}`, options: [{ maxBlock: 10, minLinesForRatio: 50 }] },
  ],
  invalid: [
    {
      code: `function f() {\n${lines(3)}\n  return 1;\n}`,
      errors: [{ messageId: 'block', data: { lines: '3', where: ' inside a function', max: '2' } }],
    },
    {
      code: `const f = () => {\n  /* a\n   b\n   c */\n  return 1;\n};`,
      errors: [{ messageId: 'block' }],
    },
    { code: `${lines(6)}\n${code(40)}`, errors: [{ messageId: 'block' }] },
    {
      code: [lines(4), code(4), lines(4), code(4, 10), lines(4), code(4, 20)].join('\n'),
      options: [{ minLinesForRatio: 10 }],
      errors: [{ messageId: 'ratio' }],
    },
  ],
});
