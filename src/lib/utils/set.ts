/** Adds every value of `source` to `target` and returns how many were not already there. */
export function unionInto<T>(target: Set<T>, source: Iterable<T>): number {
  const before = target.size;
  for (const value of source) target.add(value);
  return target.size - before;
}
