import { isNonEmptyArray, recordMap } from "#lib/utils/record.js";

import type { Source, SourceTuple } from "#lib/types/acquisition.js";

/**
 * A sourced entity before assembly attaches its acquisition sources: the same fields, but with a
 * possibly empty source list. Extractors build these; `finalizeSources` turns them into the
 * contract's `SourcedEntity` shape.
 */
export type SourceDraft<T extends { sources: SourceTuple }> = Omit<T, "sources"> & {
  sources: Source[];
};

/** Narrows an entity's sources to the contract's non-empty tuple, throwing when there are none. */
export function requireSources(fieldPath: string, sources: Source[]): SourceTuple {
  if (!isNonEmptyArray(sources)) {
    throw new Error(`${fieldPath} has no acquisition sources`);
  }
  return sources;
}

/**
 * Finalizes a record of drafts whose sources must be non-empty, keeping key order and every other
 * field. Throws on the first entity without sources rather than emitting a false `SourceTuple`.
 */
export function finalizeSources<K extends string, D extends { sources: Source[] }>(
  path: string,
  drafts: Record<K, D>,
): Record<K, Omit<D, "sources"> & { sources: SourceTuple }> {
  return recordMap(drafts, (draft, id) => ({
    ...draft,
    sources: requireSources(`${path}.${id}`, draft.sources),
  }));
}
