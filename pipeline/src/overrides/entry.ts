/** One human-reviewed fact, including the evidence needed to revisit it. */
export interface ReviewedEntry<T> {
  evidence: string;
  id: string;
  reason: string;
  value: T;
}

/** Validate against the parsed game tables, before any filtering or emitted registry is built. */
export function validateReviewedEntries<T>(
  label: string,
  entries: readonly ReviewedEntry<T>[],
  nativeIds: ReadonlySet<string>,
  isNative: (entry: ReviewedEntry<T>) => boolean,
): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.id.trim() || !entry.evidence.trim() || !entry.reason.trim() || seen.has(entry.id)) {
      throw new Error(`Invalid or duplicate reviewed ${label} entry: ${entry.id}`);
    }
    seen.add(entry.id);
    if (!nativeIds.has(entry.id)) {
      throw new Error(
        `Missing reviewed ${label} target in native game data: ${entry.id} (missing-target ${label}.${entry.id})`,
      );
    }
    if (isNative(entry)) {
      throw new Error(
        `Obsolete reviewed ${label} entry now encoded in native game data: ${entry.id}`,
      );
    }
  }
}

export function entriesToRecord<T>(entries: readonly ReviewedEntry<T>[]): Record<string, T> {
  return Object.fromEntries(entries.map(({ id, value }) => [id, value]));
}

export function entriesFromRecord<T>(
  values: Record<string, T>,
  evidence: string,
  reason: string,
): ReviewedEntry<T>[] {
  return Object.entries(values).map(([id, value]) => ({ evidence, id, reason, value }));
}
