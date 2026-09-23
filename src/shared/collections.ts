/** @file Small pure helpers the standard library lacks at ES2022. */

export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;
