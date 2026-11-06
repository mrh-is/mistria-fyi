import { applySync, receiptCovers } from "#lib/engine/sync-apply.js";
import { applySaveDay } from "#lib/engine/world-state.js";
import { stampedLocal, startLaneLocal } from "#lib/sync/lane-operations.js";

import {
  readFarmSwitchBackup,
  readProgressBlob,
  serializeFarmSwitch,
  serializeStoredProgress,
} from "./progress-storage.js";

import type { SyncResult } from "#lib/engine/sync-apply.js";
import type {
  DeviceLocalState,
  SyncApplyOutcome,
  SyncApplyRequest,
  SyncApplyStamp,
  SyncLane,
} from "#lib/sync/lane-state.js";
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
  { dropReceipt, json, keepLocal }: { dropReceipt: boolean; json: string; keepLocal: boolean },
  storedLocal: DeviceLocalState | undefined,
): { json: string; loaded: LoadedProgress } {
  const captured = readProgressBlob(json, "repair");
  if (captured.kind !== "ok") throw new Error("Invalid captured progress write");
  const { loaded } = captured;
  if (keepLocal && storedLocal) loaded.local = storedLocal;
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

export function planLaneStart(
  staged: ProgressSnapshot,
  stored: DeviceLocalState,
  lane: SyncLane,
  stamp: SyncApplyStamp | undefined,
): { json: string; local: DeviceLocalState } {
  const local = startLaneLocal(stored, lane, stamp);
  return { json: serializeStoredProgress(staged, local), local };
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

  const next: ProgressSnapshot = {
    history: result.state.history,
    // Declining a rollback keeps both the current farm's names and its clock.
    lastImport:
      result.rollback === "declined"
        ? base.lastImport
        : { ...request.metadata, identity: result.state.farm ?? request.metadata.identity },
    progress: result.state.progress,
    retained: result.farmSwitch ? fresh.retained : base.retained,
    worldState:
      result.rollback === "declined" ? base.worldState : applySaveDay(base.worldState, request.day),
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
