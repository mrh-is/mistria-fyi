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

/**
 * The outcome of restoring a backup with `restoreBackup`. A restore replaces progress, while a save
 * import merges it additively.
 */
export type BackupRestoreResult = { error: BackupRestoreErrorKind; ok: false } | { ok: true };
/** `newer-version`: a newer build wrote the backup, so this one can't read it. */
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
  /**
   * The backup of this device's progress, never its `local` section. While a newer build's data
   * blocks writes, that is the stored blob itself, otherwise verbatim: memory holds only defaults
   * or stale progress then, and a backup of those would overwrite the real progress wherever it was
   * restored.
   */
  exportBackup: () => string;
  /** The backup kept from the last farm switch, if there is one to offer. */
  readonly farmSwitchBackup: FarmSwitchBackup | undefined;
  /** Restores every field to its default, this device's preferences & `local` section included. */
  resetAll: () => void;
  /**
   * Clears progress & world state; this device's preferences & `local` section are kept, so a
   * syncing lane stays a syncing lane. Only the sync receipt goes, so the latest save file applies
   * again.
   */
  resetProgress: () => void;
  /**
   * Replaces progress & world state from a backup under the strict policy; this device's
   * preferences & `local` section are kept, and a backup never brings one in. A backup from a newer
   * build is refused, never partly read.
   */
  restoreBackup: (json: string) => BackupRestoreResult;
  /**
   * Restores the farm-switch backup like any backup; it stays in place, so restoring it again still
   * works until the next farm switch replaces it.
   */
  restoreFarmSwitchBackup: () => BackupRestoreResult;
  /** Stored progress that couldn't be read, kept so the player can download it; null if none. */
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
    resetAll(): void {
      shell.clearLaneChoice();
      shell.resetState();
      repository.enableAfterReplace();
      repository.replace({ keepLocal: false });
    },
    resetProgress(): void {
      shell.clearLaneChoice();
      shell.replaceProgress(shell.emptyProgress());
      repository.enableAfterReplace();
      const { syncReceipt: _receipt, ...kept } = shell.local;
      shell.local = kept;
      // The write keeps the stored section, which another tab may have added to since this one read.
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
