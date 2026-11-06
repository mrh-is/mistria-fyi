import { questStateRank } from "#lib/engine/domain-primitives.js";
import { changedFacts, editPlaytime, holdsGuess, progressFacts } from "#lib/engine/provenance.js";
import { applyEngagementCascade, getPartnerId, getSpouseId } from "#lib/engine/relationships.js";
import { compareFarms, mergeFarmIdentity } from "#lib/engine/save-identity.js";
import { applyAdditiveSave, mergeProgress } from "#lib/engine/save-progress.js";
import { applySaveDay } from "#lib/engine/world-state.js";
import { isRecord, recordEntries } from "#lib/utils/record.js";

import {
  emptyProgressHistory,
  readProgressBlob,
  serializeStoredProgress,
} from "./progress-storage.js";

import type { FactProvenance, ProgressHistory } from "#lib/engine/provenance.js";
import type { SaveDay } from "#lib/engine/world-state.js";
import type { DeviceLocalState } from "#lib/sync/lane-state.js";
import type { FarmIdentity, SaveImportMetadata } from "#lib/types/save-identity.js";
import type { MergeResult, ProgressState } from "#lib/types/user-progress.js";

import type { LoadedProgress, RetainedProgress, WorldState } from "./progress-storage.js";

interface ManualImportOptions {
  confirmedFarm?: string;
  day?: SaveDay;
  metadata?: SaveImportMetadata;
  playtime?: number;
}

export type ManualImportOutcome =
  | { farm: string; kind: "ask" }
  | { kind: "applied"; result: MergeResult }
  | { kind: "busy" | "newer-data" | "sync-active" | "write-failed" };

export interface ManualImport {
  base: null | string;
  before: string;
  imported: Partial<ProgressState>;
  options: ManualImportOptions;
}

type ManualImportPlan =
  | { farm: string; kind: "ask" }
  | {
      json: string;
      kind: "write";
      live: LoadedProgress;
      local: DeviceLocalState;
      result: MergeResult;
    };

/** Compares farms and builds the stored merge, plus any live edits made after confirmation. */
export function planManualImport(
  { base, before, imported, options }: ManualImport,
  stored: null | string,
  edits?: { history: ProgressHistory; progress: ProgressState; worldState: WorldState },
): ManualImportPlan {
  const captured = readProgressBlob(before, "repair");
  if (captured.kind !== "ok") throw new Error("Invalid captured progress write");
  const { confirmedFarm, day, metadata, playtime } = options;
  // The planner owns its decoded values. Merging them never mutates a caller's snapshot.
  const read = stored === null ? undefined : readProgressBlob(stored, "repair");
  const current = read?.kind === "ok" ? read.loaded : undefined;
  const capturedFarm = captured.loaded.lastImport?.identity ?? null;
  const storedFarm = current?.lastImport?.identity ?? null;
  const incomingFarm = metadata?.identity ?? null;
  const farm = manualFarmQuestion(capturedFarm, storedFarm, incomingFarm);
  if (farm !== undefined && farm !== confirmedFarm) return { farm, kind: "ask" };

  const preview = captured.loaded;
  const result = applyAdditiveSave(preview.progress, preview.history, imported, playtime);
  if (day) preview.worldState = applySaveDay(preview.worldState, day);
  if (metadata) preview.lastImport = importMetadata(storedFarm ?? capturedFarm, metadata);
  const loaded = current
    ? mergeCapturedImport(current, preview, storedHistory(base), metadata !== undefined)
    : preview;
  const json = serializeStoredProgress(loaded, loaded.local);
  if (!edits) return { json, kind: "write", live: loaded, local: loaded.local, result };

  // Later edits go to memory only. They remain eligible for the next auto-save.
  const rebased = readProgressBlob(json, "repair");
  const original = readProgressBlob(before, "repair");
  if (rebased.kind !== "ok" || original.kind !== "ok") {
    throw new Error("Invalid merged progress write");
  }
  const live = rebased.loaded;
  rebaseProgressEdits(live.progress, original.loaded.progress, edits.progress);
  const laterEdits = changedFacts(
    progressFacts(original.loaded.progress),
    progressFacts(edits.progress),
  );
  rebaseImportEdits(
    live.history,
    original.loaded.history,
    edits.history,
    laterEdits,
    editPlaytime(preview.history),
  );
  live.worldState = day ? applySaveDay(edits.worldState, day) : edits.worldState;
  return { json, kind: "write", live, local: loaded.local, result };
}

/**
 * A confirmation is valid only for the farms compared in this write. The captured progress can
 * also conflict with the stored farm when another tab changed farms without a storage event.
 */
function manualFarmQuestion(
  captured: FarmIdentity | null,
  stored: FarmIdentity | null,
  incoming: FarmIdentity | null,
): string | undefined {
  if (
    (stored && compareFarms(captured, stored) === "different") ||
    (incoming &&
      (compareFarms(captured, incoming) === "different" ||
        compareFarms(stored, incoming) === "different"))
  ) {
    return JSON.stringify(
      [captured, stored, incoming].map((identity) => {
        if (!identity) return null;
        const { creationVersion: version, saveNumber } = identity;
        return [saveNumber, version && [version.major, version.minor, version.patch, version.pre]];
      }),
    );
  }
  return undefined;
}

function importMetadata(
  tracked: FarmIdentity | null,
  metadata: SaveImportMetadata,
): SaveImportMetadata {
  const { identity } = metadata;
  if (identity.saveNumber === null && tracked?.saveNumber) {
    return { ...metadata, identity: tracked };
  }
  return {
    ...metadata,
    identity:
      compareFarms(tracked, identity) === "same" ? mergeFarmIdentity(tracked, identity) : identity,
  };
}

/** Reconciles the captured preview, including unsaved edits, with what another tab stored. */
function mergeCapturedImport(
  stored: LoadedProgress,
  captured: LoadedProgress,
  baseHistory: ProgressHistory,
  importedSave: boolean,
): LoadedProgress {
  const storedFacts = progressFacts(stored.progress);
  mergeProgress(stored.progress, captured.progress);
  mergeRetainedProgress(stored.retained, captured.retained);
  stored.worldState = captured.worldState;
  if (importedSave) stored.lastImport = captured.lastImport;
  const mergedFacts = progressFacts(stored.progress);
  const capturedFacts = progressFacts(captured.progress);
  const storedProvenance = stored.history.provenance;
  // A save agreeing with a fact already stored leaves its provenance alone, unless the save
  // confirms a guess for the value the merge kept.
  rebaseHistory(
    stored.history,
    baseHistory,
    captured.history,
    (key, { source }) =>
      (source === "save" || source === "unknown") &&
      !(
        source === "save" &&
        Object.hasOwn(storedProvenance, key) &&
        holdsGuess(storedProvenance[key]) &&
        capturedFacts.get(key) === mergedFacts.get(key)
      ) &&
      storedFacts.has(key) &&
      storedFacts.get(key) === mergedFacts.get(key),
    importedSave,
  );
  return stored;
}

/** Retain unknown IDs from both sides of an additive import; opaque relationship conflicts keep storage. */
function mergeRetainedProgress(target: RetainedProgress, imported: RetainedProgress): void {
  for (const field of ["animalCosmetics", "animals", "lists"] as const) {
    const entries: Record<string, string[] | undefined> = target[field];
    for (const [id, values] of recordEntries(imported[field])) {
      entries[id] = [...new Set([...(entries[id] ?? []), ...values])];
    }
  }
  for (const field of ["heartLevels", "skillLevels"] as const) {
    for (const [id, value] of recordEntries(imported[field])) {
      target[field][id] = Math.max(target[field][id] ?? 0, value);
    }
  }
  for (const [id, value] of recordEntries(imported.questStates)) {
    if (questStateRank(value) > questStateRank(target.questStates[id] ?? "none")) {
      target.questStates[id] = value;
    }
  }
  target.villagerRelationships = {
    ...imported.villagerRelationships,
    ...target.villagerRelationships,
  };
}

/** Rebase only edits made after confirmation; unchanged fields retain concurrent stored progress. */
function rebaseProgressEdits(
  target: ProgressState,
  before: ProgressState,
  after: ProgressState,
): void {
  rebaseFields(
    target as unknown as Record<string, unknown>,
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );
  const beforeSpouse = getSpouseId(before.villagerRelationships);
  const afterSpouse = getSpouseId(after.villagerRelationships);
  if (
    beforeSpouse !== afterSpouse ||
    getPartnerId(before.villagerRelationships) !== getPartnerId(after.villagerRelationships) ||
    (before.childChoice !== after.childChoice &&
      getSpouseId(target.villagerRelationships) !== afterSpouse)
  ) {
    // A later change of partners keeps that household together. A child choice must also stay
    // with the spouse it was made for.
    target.villagerRelationships = { ...after.villagerRelationships };
    target.breakUpsDisabled = after.breakUpsDisabled;
    target.childChoice = after.childChoice;
  } else {
    applyEngagementCascade(target.villagerRelationships, target.breakUpsDisabled);
  }
}

/**
 * Rebases history as {@link rebaseProgressEdits} rebases progress: each entry `after` added,
 * changed, or removed since `before` applies to `target`, and every other entry keeps `target`'s.
 * Entries are whole, so a fact's source & playtime always come from the same recording. The last
 * save's baseline is whole too, and `appliedSave` says `after` applied a save.
 */
function rebaseHistory(
  target: ProgressHistory,
  before: Readonly<ProgressHistory>,
  after: Readonly<ProgressHistory>,
  keepTarget?: (key: string, entry: FactProvenance) => boolean,
  appliedSave = false,
): void {
  rebaseEntries(target.provenance, before.provenance, after.provenance, keepTarget);
  rebaseEntries(target.resolutions, before.resolutions, after.resolutions);
  // The baseline's two fields describe one save, so they move together. A save `after` applied
  // replaces it even when the save left it as it was.
  if (
    appliedSave ||
    before.lastSavePlaytime !== after.lastSavePlaytime ||
    before.lastSaveUnordered !== after.lastSaveUnordered
  ) {
    if (after.lastSavePlaytime === undefined) delete target.lastSavePlaytime;
    else target.lastSavePlaytime = after.lastSavePlaytime;
    if (after.lastSaveUnordered === undefined) delete target.lastSaveUnordered;
    else target.lastSaveUnordered = after.lastSaveUnordered;
  }
}

/** Edits made after import confirmation carry the accepted save's playtime once it lands. */
function rebaseImportEdits(
  target: ProgressHistory,
  before: ProgressHistory,
  after: ProgressHistory,
  changed: string[],
  playtime: number | undefined,
): void {
  rebaseHistory(target, before, after);
  const previous = editPlaytime(before);
  for (const key of changed) {
    const record = Object.hasOwn(after.provenance, key) ? after.provenance[key] : undefined;
    if (record?.source === "manual" || record?.source === "inferred") {
      const rebased = { ...record };
      if (record.playtime === previous) {
        if (playtime === undefined) delete rebased.playtime;
        else rebased.playtime = playtime;
      }
      target.provenance[key] = rebased;
    }
  }
}

/** As {@link rebaseHistory}, entry by entry; `keepTarget` keeps `target`'s for a changed entry. */
function rebaseEntries<V>(
  target: Record<string, V>,
  before: Readonly<Record<string, V>>,
  after: Readonly<Record<string, V>>,
  keepTarget?: (key: string, entry: V) => boolean,
): void {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (Object.hasOwn(after, key) && keepTarget?.(key, after[key])) continue;
    if (Object.hasOwn(after, key)) target[key] = after[key];
    else Reflect.deleteProperty(target, key);
  }
}

/** The history a stored value holds; none for an absent or unreadable one. */
function storedHistory(json: null | string): ProgressHistory {
  const read = json === null ? undefined : readProgressBlob(json, "repair");
  return read?.kind === "ok" ? read.loaded.history : emptyProgressHistory();
}

function rebaseFields(
  target: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const previous = before[key];
    const current = after[key];
    const destination = target[key];
    if (previous instanceof Set && current instanceof Set && destination instanceof Set) {
      for (const value of previous) if (!current.has(value)) destination.delete(value);
      for (const value of current) if (!previous.has(value)) destination.add(value);
    } else if (isRecord(previous) && isRecord(current) && isRecord(destination)) {
      rebaseFields(destination, previous, current);
    } else if (previous !== current) {
      if (Object.hasOwn(after, key)) target[key] = current;
      else Reflect.deleteProperty(target, key);
    }
  }
}
