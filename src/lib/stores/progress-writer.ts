import { progressFacts } from "#lib/engine/provenance.js";
import { compareFarms } from "#lib/engine/save-identity.js";
import { applySync, receiptCovers } from "#lib/engine/sync-apply.js";
import { applySaveDay, rebaseWorldDay, withoutRecordedDay } from "#lib/engine/world-state.js";
import { stampedLocal, startLaneLocal } from "#lib/sync/lane-operations.js";

import {
  createDefaultWorldState,
  readFarmSwitchBackup,
  readProgressBlob,
  serializeFarmSwitch,
  serializeStoredProgress,
} from "./progress-storage.js";

import type { SyncResult } from "#lib/engine/sync-apply.js";
import type { SaveDay } from "#lib/engine/world-state.js";
import type {
  DeviceLocalState,
  SyncApplyOutcome,
  SyncApplyRequest,
  SyncApplyStamp,
  SyncLane,
} from "#lib/sync/lane-state.js";
import type { FarmIdentity } from "#lib/types/save-identity.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type { LoadedProgress, ProgressReadResult, ProgressSnapshot } from "./progress-storage.js";

type StoredWrite =
  | { kind: "adopt"; newer: boolean; value: string }
  | { kind: "preserve"; read: ProgressReadResult; value: string }
  | { kind: "quarantine"; value: string }
  | { kind: "ready"; read: ProgressReadResult | undefined }
  | { kind: "sync-active" };

/** Decides what must happen to the value re-read under the write lock before building a payload. */
export function planStoredWrite(
  mode: "auto-save" | "local" | "merge" | "replace" | "staged" | "sync",
  stored: null | string,
  known: null | string,
  liveLane: SyncLane | undefined,
): StoredWrite {
  const read = stored === null ? undefined : readProgressBlob(stored, "repair");
  if (mode === "merge" && (liveLane || (read?.kind === "ok" && read.loaded.local.syncLane))) {
    return { kind: "sync-active" };
  }
  if (stored === null || stored === known) return { kind: "ready", read };
  if (read?.kind === "newer" || mode === "auto-save") {
    return { kind: "adopt", newer: read?.kind === "newer", value: stored };
  }
  if (read?.kind === "unreadable") {
    return mode === "sync"
      ? { kind: "quarantine", value: stored }
      : { kind: "preserve", read, value: stored };
  }
  return { kind: "ready", read };
}

/** A replacement uses the captured progress and can keep the device data found under the lock. */
export function planReplacement(
  {
    chooseManual,
    dropReceipt,
    json,
    keepLocal,
  }: { chooseManual?: boolean; dropReceipt: boolean; json: string; keepLocal: boolean },
  storedLocal: DeviceLocalState | undefined,
): { json: string; loaded: LoadedProgress } {
  const captured = readProgressBlob(json, "repair");
  if (captured.kind !== "ok") throw new Error("Invalid captured progress write");
  const { loaded } = captured;
  if (keepLocal && storedLocal) loaded.local = storedLocal;
  if (chooseManual) loaded.local.trackingLane ??= loaded.local.syncLane ? "sync" : "manual";
  if ((chooseManual || dropReceipt) && loaded.local.reminders) {
    loaded.local = {
      ...loaded.local,
      reminders: { ...loaded.local.reminders, backupFacts: progressFacts(loaded.progress).size },
    };
  }
  if (dropReceipt) {
    const { syncReceipt: _receipt, ...kept } = loaded.local;
    loaded.local = kept;
  }
  return { json: serializeStoredProgress(loaded, loaded.local), loaded };
}

export function planLocalPatch(
  base: ProgressSnapshot & { local: DeviceLocalState },
  update: (stored: DeepReadonly<DeviceLocalState>) => DeviceLocalState | undefined,
): undefined | { json: string; local: DeviceLocalState } {
  const local = update(base.local);
  return local && { json: serializeStoredProgress(base, local), local };
}

export interface StagedLaneStart {
  clockBase: null | string;
  clockFarm: FarmIdentity | null;
  day: SaveDay;
  lane: SyncLane;
  staged: Omit<LoadedProgress, "local">;
  stamp?: SyncApplyStamp;
}

/** Layers the clock edits captured at lane start, then the save, over the stored clock. */
export function planLaneStart(
  { clockBase, clockFarm, day, lane, staged, stamp }: StagedLaneStart,
  stored: LoadedProgress | undefined,
  liveLocal: DeviceLocalState,
): { json: string; loaded: LoadedProgress } {
  const baseline = clockBase === null ? undefined : readProgressBlob(clockBase, "repair");
  const baseClock =
    baseline?.kind === "ok" ? baseline.loaded.worldState : createDefaultWorldState();
  const clock = stored
    ? rebaseWorldDay(stored.worldState, baseClock, staged.worldState)
    : staged.worldState;
  const incoming = staged.lastImport?.identity;
  const farmChanged =
    incoming &&
    (compareFarms(clockFarm, incoming) === "different" ||
      compareFarms(stored?.lastImport?.identity ?? null, incoming) === "different");
  const local = startLaneLocal(stored?.local ?? liveLocal, lane, stamp);
  const loaded = {
    ...staged,
    local,
    worldState: applySaveDay(farmChanged ? withoutRecordedDay(clock) : clock, day),
  };
  return { json: serializeStoredProgress(loaded, local), loaded };
}

export interface BackupReplacementQuestion {
  id: string;
  snapshot: string;
}

type SyncWriteFailure = "switch-failed" | "write-failed";
type SyncWritePlan =
  | {
      failure: SyncWriteFailure;
      json: string;
      kind: "write";
      loaded: LoadedProgress;
      result: SyncResult;
    }
  | { farmName: null | string; kind: "replace-backup"; savedAt: number; snapshot: string }
  | { kind: "outcome"; outcome: Exclude<SyncApplyOutcome, { kind: "applied" }> };

/** Plans a synced save, its receipt, & any farm-switch backup as one stored value. */
export function planSyncApply(
  base: LoadedProgress,
  local: DeviceLocalState,
  request: Omit<SyncApplyRequest, "wantsLane">,
  fresh: Omit<LoadedProgress, "local">,
  backupQuestion: BackupReplacementQuestion | undefined,
  now: number,
): SyncWritePlan {
  if (receiptCovers(local.syncReceipt, request.receipt)) {
    return { kind: "outcome", outcome: { kind: "skipped" } };
  }
  const outcome = applySync(
    { farm: base.lastImport?.identity ?? null, history: base.history, progress: base.progress },
    { extraction: request.extraction, farm: request.metadata.identity },
    {
      answers: request.answers,
      fresh: { farm: null, history: fresh.history, progress: fresh.progress },
    },
  );
  if (outcome.kind === "ask") {
    const { farmName } = request.metadata;
    const questions = outcome.questions.map((question) =>
      question.kind === "farm" ? { ...question, farmName } : question,
    );
    return { kind: "outcome", outcome: { kind: "ask", questions } };
  }

  const { result } = outcome;
  const replaced = result.farmSwitch ? readFarmSwitchBackup(local) : undefined;
  if (replaced) {
    const snapshot = JSON.stringify([request.metadata.identity, replaced]);
    if (backupQuestion?.snapshot !== snapshot || request.answers[backupQuestion.id] !== "accept") {
      return {
        farmName: replaced.farmName,
        kind: "replace-backup",
        savedAt: replaced.savedAt,
        snapshot,
      };
    }
  }

  const clock = result.farmSwitch ? withoutRecordedDay(base.worldState) : base.worldState;
  const next: ProgressSnapshot = {
    history: result.state.history,
    // Declining a rollback keeps both the current farm's names and its clock.
    lastImport:
      result.rollback === "declined"
        ? base.lastImport
        : { ...request.metadata, identity: result.state.farm ?? request.metadata.identity },
    progress: result.state.progress,
    retained: result.farmSwitch ? fresh.retained : base.retained,
    worldState: result.rollback === "declined" ? base.worldState : applySaveDay(clock, request.day),
  };
  const nextLocal = { ...local, ...stampedLocal(local.syncFreshness, request) };
  const built = result.farmSwitch
    ? serializeFarmSwitch(next, base, nextLocal, now)
    : serializeStoredProgress(next, nextLocal);
  const failure = result.farmSwitch ? "switch-failed" : "write-failed";
  const written = built === null ? undefined : readProgressBlob(built, "repair");
  if (written?.kind !== "ok") return { kind: "outcome", outcome: { kind: failure } };

  // Match what the adopted state serializes so the auto-save has nothing left to write.
  const json = serializeStoredProgress(written.loaded, written.loaded.local);
  return { failure, json, kind: "write", loaded: written.loaded, result };
}
