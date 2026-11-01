function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The progress a report may attach: a backup's progress without its playtimes. They're exact & only
 * grow, so matching values would link one player's public reports. See “Diagnostics” in sync.md. The
 * API applies this too, because a tab still running an older build sends whatever it has.
 */
export function progressAttachment({
  lastSavePlaytime: _lastSavePlaytime,
  provenance,
  ...progress
}: Record<string, unknown>): Record<string, unknown> {
  if (provenance === undefined) return progress;
  if (!isRecord(provenance)) return { ...progress, provenance };
  const facts = Object.entries(provenance).map(([key, fact]) => {
    if (!isRecord(fact)) return [key, fact];
    const { playtime: _playtime, ...kept } = fact;
    return [key, kept];
  });
  return { ...progress, provenance: Object.fromEntries(facts) };
}
