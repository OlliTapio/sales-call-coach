/** @file The item shape every Code node returns. */

export interface Item<T> {
  readonly json: T;
}

export const toItems = <T>(rows: readonly T[]): Item<T>[] => rows.map((json) => ({ json }));
