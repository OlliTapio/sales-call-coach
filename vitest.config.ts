import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'tools/**/*.ts', '.claude/hooks/bypass.ts'],
      exclude: ['src/n8n/globals.d.ts', 'tools/**/cli.ts', 'tools/build/build-nodes.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        'src/**': { lines: 100, branches: 90, functions: 100, statements: 100 },
        lines: 90,
        branches: 85,
      },
    },
  },
});
