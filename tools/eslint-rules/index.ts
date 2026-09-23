/** @file The repo's own ESLint plugin, registered as `local`. */
import type { ESLint } from 'eslint';
import { commentDensity } from './comment-density.ts';

export const localPlugin: ESLint.Plugin = {
  meta: { name: 'local' },
  rules: { 'comment-density': commentDensity },
};
