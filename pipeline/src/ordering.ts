/** Stable UTF-16 code-unit ordering, independent of host locale and ICU data. */
export function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
