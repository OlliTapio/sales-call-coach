/** @file Small pure helpers the standard library lacks at ES2022. */

export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

export const last = <T>(values: readonly T[]): T | undefined => values[values.length - 1];
