import type { ProgressState } from "#lib/types/user-progress.js";

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
  if (isRecord(provenance)) {
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
  if (isRecord(resolutions)) {
    redacted.resolutions = Object.fromEntries(
      Object.entries(resolutions).map(([key, fact]) => [
        key,
        isRecord(fact) && Object.hasOwn(fact, "saveValue") ? { saveValue: fact.saveValue } : {},
      ]),
    );
  } else if (Object.hasOwn(progress, "resolutions")) {
    redacted.resolutions = {};
  }
  return redacted;
}
