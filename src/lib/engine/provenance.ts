/**
 * Where each progress fact came from & when, so applying a save can tell a fact the player set by
 * hand from one an earlier save or an inference set. Pure: the store records it.
 *
 * A fact is one tickable or settable entry: an almanac item, a villager's heart level, the mine
 * floor. Ticks & unticks both record provenance, so an untick the player made is remembered too.
 */
import { recordEntries } from "#lib/utils/record.js";

import type { JsonValue } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

/**
 * - `manual`: the player set it.
 * - `inferred`: the app set it as a consequence (recorded prerequisites, a quest's recipe rewards,
 *   default unlocks, a marriage cascade).
 * - `save`: an applied save set it.
 * - `unknown`: recorded before provenance existed, or carried in by a device transfer.
 */
export const PROVENANCE_SOURCES = ["inferred", "manual", "save", "unknown"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export interface FactProvenance {
  /**
   * The `playtime` of the last applied save when the fact was recorded: a save's own playtime for
   * `save`, or the playtime the player's edit came after. Absent before any save was applied.
   */
  playtime?: number;
  source: ProvenanceSource;
}

/** Provenance keyed by {@link factKey}. */
export type ProvenanceRecord = Record<string, FactProvenance>;

/**
 * A “keep mine” for one fact: the save's value the player declined. It holds until a save
 * reports a different value, and a manual edit of the fact clears it.
 */
export interface Resolution {
  saveValue: JsonValue;
}

/** Resolutions keyed by {@link factKey}. */
export type ResolutionRecord = Record<string, Resolution>;

/**
 * The key for one fact: its `ProgressState` field, then the IDs that locate it within the field
 * (`almanac/turnip`, `animals/chicken/red`, `mineFloor`). Game IDs never contain `/`.
 */
export function factKey(field: string, ...ids: string[]): string {
  return [field, ...ids].join("/");
}

const LIST_FIELDS = [
  "almanac",
  "almanacRecipes",
  "cosmetics",
  "dates",
  "mountAppearances",
  "museum",
  "petCosmetics",
  "petSkins",
  "spells",
  "unlockedPerks",
] as const satisfies readonly (keyof ProgressState)[];

/**
 * Every non-default fact in `progress`, as its {@link factKey} & a comparable value. A fact absent
 * here is at its default: unticked, level zero, quest `none`, relationship `undecided`.
 */
export function progressFacts(progress: DeepReadonly<ProgressState>): Map<string, string> {
  const facts = new Map<string, string>();
  for (const field of LIST_FIELDS) {
    for (const id of progress[field]) facts.set(factKey(field, id), "1");
  }
  for (const field of ["animalCosmetics", "animals"] as const) {
    for (const [animalId, ids] of Object.entries(progress[field])) {
      for (const id of (ids ?? []) as Iterable<string>)
        {facts.set(factKey(field, animalId, id), "1");}
    }
  }
  for (const field of ["heartLevels", "skillLevels"] as const) {
    const levels: Readonly<Partial<Record<string, number>>> = progress[field];
    for (const [id, level] of recordEntries(levels)) {
      if (level > 0) facts.set(factKey(field, id), String(level));
    }
  }
  for (const [id, questState] of recordEntries(progress.questStates)) {
    if (questState !== "none") facts.set(factKey("questStates", id), questState);
  }
  for (const [id, relationship] of recordEntries(progress.villagerRelationships)) {
    if (relationship !== "undecided") facts.set(factKey("villagerRelationships", id), relationship);
  }
  if (progress.childChoice !== "undeclared") facts.set("childChoice", progress.childChoice);
  if (progress.hasUpperFloor) facts.set("hasUpperFloor", "1");
  if (progress.mineFloor > 0) facts.set("mineFloor", String(progress.mineFloor));
  if (progress.reachedSeason !== "spring") facts.set("reachedSeason", progress.reachedSeason);
  if (progress.renown > 0) facts.set("renown", String(progress.renown));
  return facts;
}

/** The keys of facts whose value differs between two {@link progressFacts} snapshots. */
export function changedFacts(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const changed = [...after]
    .filter(([key, value]) => before.get(key) !== value)
    .map(([key]) => key);
  for (const key of before.keys()) {
    if (!after.has(key)) changed.push(key);
  }
  return changed;
}

/** Whether a “keep mine” still applies to a save that now reports `saveValue` for the fact. */
export function resolutionHolds(resolution: Resolution | undefined, saveValue: JsonValue): boolean {
  return (
    resolution !== undefined && canonicalJson(resolution.saveValue) === canonicalJson(saveValue)
  );
}

/** JSON with object keys sorted, so equal values compare equal regardless of key order. */
function canonicalJson(value: JsonValue): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).toSorted(([a], [b]) => a.localeCompare(b, "en")))
      : entry,
  );
}
