function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The progress a report may attach: a backup's progress with redacted playtimes. They're exact & only
 * grow, so matching values would link one player's public reports. See “Diagnostics” in sync.md. The
 * API applies this too, because a tab still running an older build sends whatever it has.
 */
export function progressAttachment(progress: Record<string, unknown>): Record<string, unknown> {
  const { provenance } = progress;
  const redacted = { ...progress };
  if (Object.hasOwn(progress, "lastSavePlaytime")) redacted.lastSavePlaytime = "[redacted]";
  if (!isRecord(provenance)) return redacted;
  const facts = Object.entries(provenance).map(([key, fact]) => {
    if (!isRecord(fact)) return [key, fact];
    return [key, Object.hasOwn(fact, "playtime") ? { ...fact, playtime: "[redacted]" } : fact];
  });
  return { ...redacted, provenance: Object.fromEntries(facts) };
}
