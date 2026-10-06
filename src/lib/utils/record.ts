export type NonEmptyArray<T> = [T, ...T[]];

/** Returns `record[key]`, first storing `create()` there when the key is unset. */
export function getOrCreate<K extends PropertyKey, V>(
  record: Partial<Record<K, V>>,
  key: K,
  create: () => V,
): V {
  const existing = record[key];
  if (existing !== undefined) return existing;
  const created = create();
  record[key] = created;
  return created;
}

export function isNonEmptyArray<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

export function recordEntries<R extends Record<string, unknown>>(
  record: R,
): { [K in keyof R]-?: [K, Exclude<R[K], undefined>] }[keyof R][];
export function recordEntries(record: Record<string, unknown>): [string, unknown][] {
  return Object.entries(record).filter(([, value]) => value !== undefined);
}

export function recordForEach<K extends string, T>(
  record: Record<K, T>,
  callbackfn: (value: [K, T], index: number, record: Record<K, T>) => void,
  thisArg?: unknown,
): void {
  for (const [index, key] of recordKeys(record).entries()) {
    callbackfn.call(thisArg, [key, record[key]], index, record);
  }
}
export function recordKeys<K extends string, T>(record: Record<K, T>): K[] {
  return Object.keys(record) as K[];
}
export function recordMap<K extends string, T, U>(
  record: Record<K, T>,
  callbackfn: (value: T, key: K, index: number, record: Record<K, T>) => U,
  thisArg?: unknown,
): Record<K, U> {
  const result = {} as Record<K, U>;
  for (const [index, key] of recordKeys(record).entries()) {
    result[key] = callbackfn.call(thisArg, record[key], key, index, record);
  }
  return result;
}
export function recordValues<K extends PropertyKey, T>(record: Record<K, T>): T[] {
  return Object.values(record);
}
