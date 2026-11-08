import {
  readFarmSwitchBackup,
  readProgressBlob,
  serializeProgress,
  withoutDeviceLocal,
} from "#lib/stores/progress-storage.js";

import type { ProgressRepository } from "#lib/stores/progress-repository.js";
import type {
  FarmSwitchBackup,
  LoadedProgress,
  ProgressSnapshot,
} from "#lib/stores/progress-storage.js";
import type { DeviceLocalState } from "#lib/sync/lane-state.js";

/** A restore replaces progress, while a save import merges it additively. */
export type BackupRestoreResult = { error: BackupRestoreErrorKind; ok: false } | { ok: true };
export type BackupRestoreErrorKind = "invalid-fields" | "malformed-json" | "newer-version";

interface BackupShell {
  clearLaneChoice: () => void;
  emptyProgress: () => Omit<LoadedProgress, "local">;
  local: DeviceLocalState;
  replaceProgress: (loaded: Omit<LoadedProgress, "local">) => void;
  resetState: () => void;
  snapshot: () => ProgressSnapshot;
  readonly unreadableData: null | string;
}

interface BackupFacade {
  exportBackup: () => string;
  readonly farmSwitchBackup: FarmSwitchBackup | undefined;
  resetAll: () => void;
  resetProgress: () => void;
  restoreBackup: (json: string) => BackupRestoreResult;
  restoreFarmSwitchBackup: () => BackupRestoreResult;
  readonly unreadableData: null | string;
}

export function createBackupFacade(
  repository: Pick<
    ProgressRepository,
    "enableAfterReplace" | "newerDataBlocked" | "readStored" | "replace"
  >,
  shell: BackupShell,
): BackupFacade {
  function restoreBackup(json: string): BackupRestoreResult {
    const result = readProgressBlob(json, "strict");
    if (result.kind === "newer") return { error: "newer-version", ok: false };
    if (result.kind === "unreadable") return { error: result.error, ok: false };
    shell.replaceProgress(result.loaded);
    repository.enableAfterReplace();
    shell.local = { ...shell.local, trackingLane: shell.local.syncLane ? "sync" : "manual" };
    repository.replace({ chooseManual: true });
    return { ok: true };
  }

  return {
    /** Newer stored data is backed up verbatim, rather than exporting stale in-memory progress. */
    exportBackup(): string {
      if (repository.newerDataBlocked) {
        const value = repository.readStored();
        if (value !== null) return withoutDeviceLocal(value);
      }
      return serializeProgress(shell.snapshot());
    },
    get farmSwitchBackup(): FarmSwitchBackup | undefined {
      return readFarmSwitchBackup(shell.local);
    },
    /** Restores defaults, including device preferences & local state. */
    resetAll(): void {
      shell.clearLaneChoice();
      shell.resetState();
      repository.enableAfterReplace();
      repository.replace({ keepLocal: false });
    },
    /** Keeps device preferences & the lane, but clears progress & the sync receipt. */
    resetProgress(): void {
      shell.clearLaneChoice();
      shell.replaceProgress(shell.emptyProgress());
      repository.enableAfterReplace();
      const { syncReceipt: _receipt, ...kept } = shell.local;
      shell.local = kept;
      repository.replace({ dropReceipt: true });
    },
    restoreBackup,
    restoreFarmSwitchBackup(): BackupRestoreResult {
      const kept = readFarmSwitchBackup(shell.local);
      if (!kept) return { error: "invalid-fields", ok: false };
      return restoreBackup(JSON.stringify(kept.backup));
    },
    get unreadableData(): null | string {
      return shell.unreadableData;
    },
  };
}
