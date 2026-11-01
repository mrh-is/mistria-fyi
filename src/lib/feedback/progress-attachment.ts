import { PROVENANCE_SOURCES } from "#lib/engine/provenance.js";

import type { ProgressState } from "#lib/types/user-progress.js";

/** Leaves room for a 24 KiB sync log, the maximum message, & issue formatting. */
export const MAX_PROGRESS_ATTACHMENT_BYTES = 32 * 1024;

// Exhaustive by design: a new progress field needs an explicit public/private classification.
const PUBLIC_PROGRESS_KEYS = {
  almanac: true,
  almanacRecipes: true,
  animalCosmetics: true,
  animals: true,
  breakUpsDisabled: true,
  childChoice: true,
  cosmetics: true,
  hasUpperFloor: true,
  heartLevels: true,
  lastSavePlaytime: true,
  mineFloor: true,
  mountAppearances: true,
  museum: true,
  petCosmetics: true,
  petSkins: true,
  provenance: true,
  questStates: true,
  reachedSeason: true,
  renown: true,
  resolutions: true,
  skillLevels: true,
  spells: true,
  unlockedPerks: true,
  villagerRelationships: true,
} satisfies Record<
  "lastSavePlaytime" | "provenance" | "resolutions" | keyof ProgressState,
  boolean
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Re-project summaries sent by this build; never echo arbitrary summary metadata. */
function projectSummary(value: unknown, field: string): Record<string, unknown> | undefined {
  if (!isRecord(value) || value.summarized !== true || !isCount(value.count)) return undefined;
  const summary: Record<string, unknown> = { count: value.count, summarized: true };
  if (field === "provenance" && isRecord(value.byField)) {
    const byField = value.byField;
    summary.byField = Object.fromEntries(
      Object.keys(PUBLIC_PROGRESS_KEYS).flatMap((key) => {
        const counts = byField[key];
        if (!isRecord(counts)) return [];
        return [
          [
            key,
            Object.fromEntries(
              PROVENANCE_SOURCES.filter((source) => isCount(counts[source])).map((source) => [
                source,
                counts[source],
              ]),
            ),
          ],
        ];
      }),
    );
  }
  return summary;
}

function summarizeProvenance(provenance: Record<string, unknown>): Record<string, unknown> {
  const byField: Record<string, Partial<Record<(typeof PROVENANCE_SOURCES)[number], number>>> = {};
  for (const [key, fact] of Object.entries(provenance)) {
    const field = key.split("/")[0];
    if (!Object.hasOwn(PUBLIC_PROGRESS_KEYS, field) || !isRecord(fact)) continue;
    const source = PROVENANCE_SOURCES.find((candidate) => candidate === fact.source);
    if (!source) continue;
    const counts = byField[field] ?? {};
    byField[field] = counts;
    counts[source] = (counts[source] ?? 0) + 1;
  }
  return { byField, count: Object.keys(provenance).length, summarized: true };
}

function fitAttachment(attachment: Record<string, unknown>): Record<string, unknown> {
  if (byteSize(attachment) <= MAX_PROGRESS_ATTACHMENT_BYTES) return attachment;
  if (isRecord(attachment.provenance) && attachment.provenance.summarized !== true) {
    attachment.provenance = summarizeProvenance(attachment.provenance);
  }
  const collections = Object.entries(attachment)
    .filter(([, value]) => Array.isArray(value) || (isRecord(value) && value.summarized !== true))
    .toSorted((a, b) => byteSize(b[1]) - byteSize(a[1]));
  for (const [field, value] of collections) {
    if (byteSize(attachment) <= MAX_PROGRESS_ATTACHMENT_BYTES) break;
    attachment[field] = { count: Object.keys(value as object).length, summarized: true };
  }
  return attachment;
}

/**
 * Closed public projection, shared by the preview, submission, & API. A newer build's backup may
 * contain unclassified fields; none become public by default. See “Diagnostics” in sync.md.
 */
export function progressAttachment(progress: Record<string, unknown>): Record<string, unknown> {
  const { provenance, resolutions } = progress;
  const redacted = Object.fromEntries(
    Object.keys(PUBLIC_PROGRESS_KEYS)
      .filter((key) => Object.hasOwn(progress, key))
      .map((key) => [key, progress[key]]),
  );
  if (Object.hasOwn(progress, "lastSavePlaytime")) redacted.lastSavePlaytime = "[redacted]";
  const provenanceSummary = projectSummary(provenance, "provenance");
  if (provenanceSummary) {
    redacted.provenance = provenanceSummary;
  } else if (isRecord(provenance)) {
    redacted.provenance = Object.fromEntries(
      Object.entries(provenance).map(([key, fact]) => {
        if (!isRecord(fact)) return [key, {}];
        return [
          key,
          Object.fromEntries(
            ["source", "obtainedSource", "playtime"]
              .filter((field) => Object.hasOwn(fact, field))
              .map((field) => [field, field === "playtime" ? "[redacted]" : fact[field]]),
          ),
        ];
      }),
    );
  } else if (Object.hasOwn(progress, "provenance")) {
    redacted.provenance = {};
  }
  const resolutionsSummary = projectSummary(resolutions, "resolutions");
  if (resolutionsSummary) {
    redacted.resolutions = resolutionsSummary;
  } else if (isRecord(resolutions)) {
    redacted.resolutions = Object.fromEntries(
      Object.entries(resolutions).map(([key, fact]) => [
        key,
        isRecord(fact) && Object.hasOwn(fact, "saveValue") ? { saveValue: fact.saveValue } : {},
      ]),
    );
  } else if (Object.hasOwn(progress, "resolutions")) {
    redacted.resolutions = {};
  }
  for (const [field, value] of Object.entries(redacted)) {
    const summary = projectSummary(value, field);
    if (summary) redacted[field] = summary;
  }
  return fitAttachment(redacted);
}
