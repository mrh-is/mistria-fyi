import { getOrCreate } from "#lib/utils/record.js";

import { emptyMergeCounts } from "./domain-primitives.js";
import { PROGRESS_FIELD_SPECS } from "./progress-fields.js";
import {
  changedFacts,
  confirmedBySave,
  factFieldOf,
  holdsGuess,
  obtainedSourceOf,
  progressFacts,
} from "./provenance.js";
import { mergeHousehold } from "./relationships.js";

import type { MergeCounts, MergeResult, ProgressState } from "#lib/types/user-progress.js";

import type { FieldSpec, ProgressField } from "./progress-fields.js";
import type { FactProvenance, ProgressHistory, ProvenanceSource } from "./provenance.js";

/** A fact value's place in its field's order; `undefined` is the default. */
export function factRank(field: ProgressField, value: string | undefined): number {
  const spec: FieldSpec = PROGRESS_FIELD_SPECS[field];
  if (spec.shape === "level" || spec.shape === "levels") return Number(value ?? 0);
  if ((spec.shape === "choice" || spec.shape === "choices") && spec.rank) {
    return spec.rank(value ?? spec.default);
  }
  return Number(value !== undefined);
}

/** Sets one fact to a `progressFacts` value, or to its default for `undefined`. */
export function writeFact(progress: ProgressState, key: string, value: string | undefined): void {
  const [field, id = "", member = ""] = key.split("/") as [ProgressField, string?, string?];
  if (!Object.hasOwn(PROGRESS_FIELD_SPECS, field)) return;
  const spec: FieldSpec = PROGRESS_FIELD_SPECS[field];
  // The field spec describes the matching value's shape for this dynamic key.
  const fields: Record<ProgressField, unknown> = progress;
  switch (spec.shape) {
    case "animal-lists": {
      const byAnimal = fields[field] as Record<string, Set<string>>;
      const ids = getOrCreate(byAnimal, id, () => new Set<string>());
      if (value === undefined) ids.delete(member);
      else ids.add(member);
      return;
    }
    case "flag":
      fields[field] = value !== undefined;
      return;
    case "choice":
      fields[field] = value ?? spec.default;
      return;
    case "choices": {
      const choices = fields[field] as Record<string, string>;
      if (value === undefined && spec.removeDefault) {
        fields[field] = Object.fromEntries(
          Object.entries(choices).filter(([entry]) => entry !== id),
        );
      } else {
        choices[id] = value ?? spec.default;
      }
      return;
    }
    case "levels":
      (fields[field] as Record<string, number>)[id] = Number(value ?? 0);
      return;
    case "level":
      fields[field] = Number(value ?? 0);
      return;
    case "list": {
      const ids = fields[field] as Set<string>;
      if (value === undefined) ids.delete(id);
      else ids.add(id);
    }
  }
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

/** The additive policy, used for the import preview and again when reconciling storage. */
export function mergeProgress(
  progress: ProgressState,
  imported: Partial<ProgressState>,
): MergeResult {
  const counts = emptyMergeCounts();
  const before = progressFacts(progress);
  for (const [key, raw] of progressFacts(imported)) {
    const field = factFieldOf(key) as ProgressField;
    const spec: FieldSpec = PROGRESS_FIELD_SPECS[field];
    if (spec.household) continue;
    const value = "clamp" in spec ? String(spec.clamp(Number(raw))) : raw;
    const increase = factRank(field, value) - factRank(field, before.get(key));
    if (!(increase > 0)) continue;
    writeFact(progress, key, value);
    const count = spec.mergeCount ?? (field as keyof MergeCounts);
    counts[count] += spec.shape === "level" ? increase : 1;
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
  playtime: number | undefined,
): MergeResult {
  recordSavePlaytime(history, playtime);
  const before = progressFacts(progress);
  const result = mergeProgress(progress, imported);
  const after = progressFacts(progress);
  for (const key of changedFacts(before, after)) {
    history.provenance[key] = appliedFact(
      history.provenance[key],
      "save",
      playtime,
      before.get(key),
      after.get(key),
    );
  }
  for (const [key, value] of progressFacts(imported)) {
    const record = Object.hasOwn(history.provenance, key) ? history.provenance[key] : undefined;
    if (record && holdsGuess(record) && after.get(key) === value) {
      history.provenance[key] = confirmedBySave(record, playtime);
    }
  }
  return result;
}
