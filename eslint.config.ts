/**
 * @file Lint policy. The layer rules mirror docs/ARCHITECTURE.md; change both together.
 * Messages are written for whoever has to fix them, human or agent.
 */
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import js from '@eslint/js';
import functional from 'eslint-plugin-functional';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { localPlugin } from './tools/eslint-rules/index.ts';

const N8N_GLOBALS = ['$input', '$now', '$', '$json', '$items', '$node'];

const noGlobals = (names: readonly string[], why: string) =>
  names.map((name) => ({ name, message: `${name} is an n8n global. ${why}` }));

const ban = (group: readonly string[], why: string, allowTypeImports = false) => ({
  group: [...group],
  message: why,
  allowTypeImports,
});

const LUXON_TYPES_ONLY = {
  name: 'luxon',
  allowTypeImports: true,
  message: 'n8n provides DateTime as a global; import Luxon types only (`import type`).',
};

const NO_NODE_BUILTINS = ban(
  ['node:*', 'fs', 'path', 'child_process', 'http', 'https', 'os'],
  'Code nodes cannot use Node built-ins; do I/O with n8n nodes on the canvas.',
);

const SRC_ONLY = ban(
  ['**/tools/**', '**/test/**'],
  'src/ ships to n8n; it must not import tooling or tests.',
);

const layer = (
  files: string,
  groups: readonly ReturnType<typeof ban>[],
  globals: readonly string[],
  why: string,
): Linter.Config => ({
  files: [files],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      { paths: [LUXON_TYPES_ONLY], patterns: [NO_NODE_BUILTINS, SRC_ONLY, ...groups] },
    ],
    'no-restricted-globals': ['error', ...noGlobals(globals, why)],
  },
});

const CORE = [
  'src/domain/**/*.ts',
  'src/views/**/*.ts',
  'src/shared/**/*.ts',
  'src/adapters/**/*.ts',
];

export default defineConfig(
  { ignores: ['node_modules/', 'coverage/', 'dist/', '**/*.js', '**/*.mjs'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  comments.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { local: localPlugin },
    rules: {
      'local/comment-density': 'error',
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/disable-enable-pair': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { minimumDescriptionLength: 10 }],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowString: false, allowNumber: false, allowNullableObject: true },
      ],
      'no-warning-comments': [
        'error',
        { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'start' },
      ],
      eqeqeq: 'error',
      'no-param-reassign': ['error', { props: true }],
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },

  // Layers: shared <- domain <- views; adapters -> domain/shared; nodes -> everything in src.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [LUXON_TYPES_ONLY], patterns: [NO_NODE_BUILTINS, SRC_ONLY] },
      ],
    },
  },
  layer(
    'src/shared/**/*.ts',
    [
      ban(
        ['**/domain/**', '**/views/**', '**/adapters/**', '**/nodes/**', '**/n8n/**'],
        'shared/ is the bottom layer; it imports nothing from src/.',
      ),
    ],
    [...N8N_GLOBALS, 'DateTime'],
    'shared/ is pure; take values as parameters.',
  ),
  layer(
    'src/domain/**/*.ts',
    [
      ban(
        ['**/views/**', '**/adapters/**', '**/nodes/**', '**/n8n/**'],
        'domain/ may import shared/ only. Presentation goes in views/, parsing in adapters/.',
      ),
    ],
    [...N8N_GLOBALS, 'DateTime'],
    'domain/ is pure; the controller in src/nodes reads globals and passes values in.',
  ),
  layer(
    'src/views/**/*.ts',
    [
      ban(
        ['**/adapters/**', '**/nodes/**', '**/n8n/**'],
        'views/ may import domain/ types and shared/ only.',
      ),
      ban(['**/domain/**'], 'views/ may import domain/ types only; use `import type`.', true),
    ],
    [...N8N_GLOBALS, 'DateTime'],
    'views/ is pure; the controller passes values in.',
  ),
  layer(
    'src/adapters/**/*.ts',
    [
      ban(
        ['**/views/**', '**/nodes/**', '**/n8n/**'],
        'adapters/ turn raw JSON into domain types; they import domain/ and shared/ only.',
      ),
    ],
    N8N_GLOBALS,
    'adapters/ receive raw JSON as a parameter; only src/nodes and src/n8n read n8n globals.',
  ),

  layer(
    'src/n8n/**/*.ts',
    [
      ban(
        ['**/domain/**', '**/views/**', '**/adapters/**', '**/nodes/**'],
        'n8n/ is the runtime boundary; it imports shared/ only.',
      ),
    ],
    [],
    '',
  ),
  layer(
    'src/nodes/**/*.ts',
    [],
    ['$now'],
    'Read the clock through localNow() in src/n8n/clock.ts.',
  ),

  // Functional core, imperative shell.
  {
    files: CORE,
    extends: [functional.configs.externalTypeScriptRecommended, functional.configs.recommended],
    rules: {
      'functional/no-let': 'error',
      'functional/no-loop-statements': 'error',
      'functional/no-throw-statements': 'error',
      'functional/no-try-statements': 'error',
      'functional/no-classes': 'error',
      'functional/immutable-data': 'error',
      'functional/functional-parameters': ['error', { enforceParameterCount: false }],
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off',
      'functional/no-conditional-statements': 'off',
      'functional/no-mixed-types': 'off',
    },
  },
  {
    files: ['src/nodes/**/*.ts', 'src/n8n/**/*.ts'],
    extends: [functional.configs.externalTypeScriptRecommended, functional.configs.lite],
    rules: {
      'functional/functional-parameters': 'off',
      'functional/no-throw-statements': 'off',
      'functional/prefer-immutable-types': 'off',
      'functional/type-declaration-immutability': 'off',
      'functional/no-conditional-statements': 'off',
    },
  },

  // Tooling and tests run on Node, not in n8n.
  {
    files: ['tools/**/*.ts', 'test/**/*.ts', '.claude/hooks/**/*.ts', '*.config.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'allow-as-parameter' },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
);
