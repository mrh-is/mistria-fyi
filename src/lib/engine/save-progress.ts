import { getOrCreate } from "#lib/utils/record.js";

import { emptyMergeCounts, questStateRank, seasonOrdinal } from "./domain-primitives.js";
import {
  clampLevel,
  clampMineFloor,
  clampRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "./progress.js";
import {
  changedFacts,
  confirmedBySave,
  editPlaytime,
  factFieldOf,
  holdsGuess,
  obtainedSourceOf,
  progressFacts,
} from "./provenance.js";
import { mergeHousehold } from "./relationships.js";

import type { Season, VillagerRelationship } from "#lib/types/tracker-data.js";
import type {
  ChildChoice,
  MergeResult,
  ProgressState,
  QuestState,
} from "#lib/types/user-progress.js";

import type { FactProvenance, ProgressHistory, ProvenanceSource } from "./provenance.js";

type ProgressField = keyof ProgressState;

const LEVEL_FIELDS: ReadonlySet<ProgressField> = new Set<ProgressField>([
  "heartLevels",
  "mineFloor",
  "reachedSeason",
  "renown",
  "skillLevels",
]);

/** A fact value's place in its field's order; `undefined` is the default. */
export function factRank(field: ProgressField, value: string | undefined): number {
  if (field === "villagerRelationships") {
    if (value === "married") return 3;
    if (value === "proposed") return 2;
    return value === undefined ? 0 : 1;
  }
  if (field === "questStates") return questStateRank((value ?? "none") as QuestState);
  if (field === "reachedSeason") return seasonOrdinal((value ?? "spring") as Season);
  return LEVEL_FIELDS.has(field) ? Number(value ?? 0) : Number(value !== undefined);
}

/** Sets one fact to a `progressFacts` value, or to its default for `undefined`. */
export function writeFact(progress: ProgressState, key: string, value: string | undefined): void {
  const [field, id = "", member = ""] = key.split("/") as [ProgressField, string?, string?];
  switch (field) {
    case "animalCosmetics":
    case "animals": {
      const byAnimal = progress[field] as Record<string, Set<string>>;
      const ids = getOrCreate(byAnimal, id, () => new Set<string>());
      if (value === undefined) ids.delete(member);
      else ids.add(member);
      return;
    }
    case "hasUpperFloor":
      progress.hasUpperFloor = value !== undefined;
      return;
    case "breakUpsDisabled":
      progress.breakUpsDisabled = value !== undefined;
      return;
    case "childChoice":
      progress.childChoice = (value ?? "undeclared") as ChildChoice;
      return;
    case "villagerRelationships":
      if (value === undefined) {
        progress.villagerRelationships = Object.fromEntries(
          Object.entries(progress.villagerRelationships).filter(([villager]) => villager !== id),
        );
      } else {
        (progress.villagerRelationships as Record<string, VillagerRelationship>)[id] =
          value as VillagerRelationship;
      }
      return;
    case "heartLevels":
    case "skillLevels":
      (progress[field] as Record<string, number>)[id] = Number(value ?? 0);
      return;
    case "questStates":
      (progress.questStates as Record<string, QuestState>)[id] = (value ?? "none") as QuestState;
      return;
    case "mineFloor":
    case "renown":
      progress[field] = Number(value ?? 0);
      return;
    case "reachedSeason":
      progress.reachedSeason = (value ?? "spring") as Season;
      return;
    case "almanac":
    case "almanacRecipes":
    case "cosmetics":
    case "mountAppearances":
    case "museum":
    case "petCosmetics":
    case "petSkins":
    case "spells":
    case "unlockedPerks": {
      const ids = progress[field] as Set<string>;
      if (value === undefined) ids.delete(id);
      else ids.add(id);
    }
  }
}

export function isLevelField(field: ProgressField): boolean {
  return LEVEL_FIELDS.has(field);
}

export function appliedFact(
  previous: FactProvenance | undefined,
  source: ProvenanceSource,
  playtime: number | undefined,
  before: string | undefined,
  after: string | undefined,
): FactProvenance {
  const obtainedSource = obtainedSourceOf(previous, source, before, after);
  return {
    ...(obtainedSource === undefined ? {} : { obtainedSource }),
    ...(playtime === undefined ? {} : { playtime }),
    source,
  };
}

export function recordSavePlaytime(history: ProgressHistory, playtime: number | undefined): void {
  if (playtime === undefined) {
    history.lastSaveUnordered = true;
  } else {
    history.lastSavePlaytime = playtime;
    delete history.lastSaveUnordered;
  }
}

const NORMALIZE_LEVEL: Partial<Record<ProgressField, (value: number) => number>> = {
  heartLevels: (value) => clampLevel(value, MAX_HEART_LEVEL),
  mineFloor: clampMineFloor,
  renown: clampRenownLevel,
  skillLevels: (value) => clampLevel(value, MAX_SKILL_LEVEL),
};

/** The additive policy, used for the import preview and again when reconciling storage. */
export function mergeProgress(
  progress: ProgressState,
  imported: Partial<ProgressState>,
): MergeResult {
  const counts = emptyMergeCounts();
  const before = progressFacts(progress);
  for (const [key, raw] of progressFacts(imported)) {
    const field = factFieldOf(key) as ProgressField;
    if (
      field === "breakUpsDisabled" ||
      field === "childChoice" ||
      field === "villagerRelationships"
    ) {
      continue;
    }
    const normalize = NORMALIZE_LEVEL[field];
    const value = normalize ? String(normalize(Number(raw))) : raw;
    const increase = factRank(field, value) - factRank(field, before.get(key));
    if (!(increase > 0)) continue;
    writeFact(progress, key, value);
    if (field === "mineFloor" || field === "renown") counts[field] = increase;
    else if (field === "questStates") counts.quests++;
    else if (field === "unlockedPerks") counts.perks++;
    else counts[field]++;
  }

  const household = mergeHousehold(progress, imported);
  progress.villagerRelationships = household.villagerRelationships;
  progress.breakUpsDisabled = household.breakUpsDisabled;
  progress.childChoice = household.childChoice;
  return { conflicts: household.conflicts, counts: { ...counts, ...household.counts } };
}

/** Apply a save additively, stamping changed facts & facts that confirm a guess. */
export function applyAdditiveSave(
  progress: ProgressState,
  history: ProgressHistory,
  imported: Partial<ProgressState>,
  source: "save" | "unknown",
  playtime: number | undefined,
): MergeResult {
  if (source === "save") recordSavePlaytime(history, playtime);
  const stamp = source === "save" ? playtime : editPlaytime(history);
  const before = progressFacts(progress);
  const result = mergeProgress(progress, imported);
  const after = progressFacts(progress);
  for (const key of changedFacts(before, after)) {
    history.provenance[key] = appliedFact(
      history.provenance[key],
      source,
      stamp,
      before.get(key),
      after.get(key),
    );
  }
  if (source === "save") {
    for (const [key, value] of progressFacts(imported)) {
      const record = Object.hasOwn(history.provenance, key) ? history.provenance[key] : undefined;
      if (record && holdsGuess(record) && after.get(key) === value) {
        history.provenance[key] = confirmedBySave(record, stamp);
      }
    }
  }
  return result;
}
