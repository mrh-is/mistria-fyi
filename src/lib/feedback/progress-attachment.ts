import type { SerializedState } from "#lib/stores/progress-storage.js";

/**
 * The progress a report may attach: a backup's progress without its playtimes. They're exact & only
 * grow, so matching values would link one player's public reports. See “Diagnostics” in sync.md.
 */
export function progressAttachment({
  lastSavePlaytime: _lastSavePlaytime,
  provenance,
  ...progress
}: SerializedState["progress"]): Record<string, unknown> {
  if (!provenance) return progress;
  const facts = Object.entries(provenance).map(([key, { playtime: _playtime, ...fact }]) => [
    key,
    fact,
  ]);
  return { ...progress, provenance: Object.fromEntries(facts) };
}
