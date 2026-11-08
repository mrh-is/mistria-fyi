import { stageSyncSave, syncLaneOperations } from "#lib/sync/lane-operations.js";

import type { SyncReceipt } from "#lib/engine/sync-apply.js";
import type { SyncFreshness } from "#lib/engine/sync-freshness.js";
import type { ProgressRepository } from "#lib/stores/progress-repository.js";
import type { LoadedProgress, WorldState } from "#lib/stores/progress-storage.js";
import type {
  DeviceLocalState,
  PendingRetire,
  SyncApplyOutcome,
  SyncApplyRequest,
  SyncApplyStamp,
  SyncedSave,
  SyncLane,
  TrackingLane,
} from "#lib/sync/lane-state.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

interface SyncShell {
  readonly canStartTrackingByHand: boolean;
  chooseSync: () => void;
  emptyProgress: () => Omit<LoadedProgress, "local">;
  readonly laneChoiceNeeded: boolean;
  readonly local: DeviceLocalState;
  readonly ready: boolean;
  takePendingHandEdit: () => (() => void) | undefined;
  readonly worldState: WorldState;
}

type LaneOperations = ReturnType<typeof syncLaneOperations>;

interface SyncFacade extends LaneOperations {
  /**
   * Applies a synced save in one immediate write: the settled progress, the receipt, & any
   * farm-switch backup land together or not at all, so the receipt advances only here. It never
   * unblocks a quarantined store or a newer build's data.
   */
  applySyncedSave: (request: SyncApplyRequest) => Promise<SyncApplyOutcome>;
  /** Drops the hand edit waiting for a tracking lane, so nothing is recorded. */
  cancelLaneChoice: () => void;
  /** Whether this guide still needs a choice between hand tracking & sync. */
  readonly canStartTrackingByHand: boolean;
  /** Keeps the first check-off while sync setup obtains the save that chooses its lane. */
  chooseSyncTracking: () => void;
  /**
   * Starts a syncing lane: erases progress & history, applies the lane's first save, & records the
   * lane, all in one write, so a setup that never gets this far leaves nothing behind. Any old
   * receipt & lane go, replaced by `stamp`'s; the farm-switch backup & pending retires stay.
   * Resolves with whether the write landed.
   */
  startSyncLane: (
    lane: SyncLane,
    save: SyncedSave,
    stillWanted?: () => boolean,
    stamp?: SyncApplyStamp,
  ) => Promise<boolean>;
  /**
   * Puts this device on the manual tracking lane, then runs the hand edit that was waiting for it.
   * Storage that can't keep the lane keeps nothing, so the edit is dropped; while persistence is
   * off, nothing is stored either way & the edit just runs. Resolves with whether the device may
   * now record by hand.
   */
  startTrackingByHand: () => Promise<boolean>;
  /**
   * True while stored progress can't be written (quarantined, from a newer build, or not loaded),
   * so no syncing lane may start.
   */
  readonly syncBlocked: boolean;
  /** When the last save came & the gaps learned between saves, while syncing. */
  readonly syncFreshness: DeepReadonly<SyncFreshness> | undefined;
  /** This device's sync lane, or `undefined` while it tracks by hand. */
  readonly syncLane: DeepReadonly<SyncLane> | undefined;
  /** Codes this device stopped sharing that the relay hasn't confirmed retired yet. */
  readonly syncPendingRetires: readonly DeepReadonly<PendingRetire>[];
  /** What this device last applied, which only `applySyncedSave` & a lane start advance. */
  readonly syncReceipt: DeepReadonly<SyncReceipt> | undefined;
  /**
   * How this device tracks, or `undefined` until it chooses. A sync lane always means syncing; a
   * stored `sync` without one can only be left over, and progress left behind is tracked by hand.
   */
  readonly trackingLane: TrackingLane | undefined;
  /** Whether a hand edit is waiting for the player to choose a tracking lane. */
  readonly trackingLaneNeeded: boolean;
}

export function createSyncFacade(
  repository: Pick<ProgressRepository, "clockBase" | "enableAfterReplace" | "write" | "writeLocal">,
  shell: SyncShell,
): SyncFacade {
  return {
    ...syncLaneOperations(repository.writeLocal),
    async applySyncedSave(request: SyncApplyRequest): Promise<SyncApplyOutcome> {
      const settled: { outcome: SyncApplyOutcome } = { outcome: { kind: "blocked" } };
      await repository.write({
        kind: "sync",
        request,
        settle: (outcome) => {
          settled.outcome = outcome;
        },
      });
      return settled.outcome;
    },
    cancelLaneChoice(): void {
      shell.takePendingHandEdit();
    },
    get canStartTrackingByHand(): boolean {
      return shell.canStartTrackingByHand;
    },
    chooseSyncTracking: shell.chooseSync,
    async startSyncLane(
      lane: SyncLane,
      save: SyncedSave,
      stillWanted: () => boolean = () => true,
      stamp?: SyncApplyStamp,
    ): Promise<boolean> {
      // Built aside from live state, which stays untouched until the write lands, so a lane start
      // that's cancelled or can't be stored never erases anything, even in a later save.
      const staged = shell.emptyProgress();
      staged.worldState = $state.snapshot(shell.worldState);
      stageSyncSave(staged, { ...save, metadata: $state.snapshot(save.metadata) });
      repository.enableAfterReplace();
      const written = await repository.write({
        clockBase: repository.clockBase,
        day: { ...save.day },
        guard: stillWanted,
        kind: "staged",
        lane: $state.snapshot(lane),
        ...(stamp ? { stamp } : {}),
        staged,
      });
      const pending = shell.takePendingHandEdit();
      if (written) pending?.();
      return written;
    },
    async startTrackingByHand(): Promise<boolean> {
      const pending = shell.takePendingHandEdit();
      if (shell.ready) {
        const written = await repository.writeLocal((stored) => ({
          ...(structuredClone(stored) as DeviceLocalState),
          trackingLane: stored.syncLane ? "sync" : "manual",
        }));
        if (!written) return false;
      }
      pending?.();
      return true;
    },
    get syncBlocked(): boolean {
      return !shell.ready;
    },
    get syncFreshness(): DeepReadonly<SyncFreshness> | undefined {
      return shell.local.syncFreshness;
    },
    get syncLane(): DeepReadonly<SyncLane> | undefined {
      return shell.local.syncLane;
    },
    get syncPendingRetires(): readonly DeepReadonly<PendingRetire>[] {
      return shell.local.syncPendingRetires ?? [];
    },
    get syncReceipt(): DeepReadonly<SyncReceipt> | undefined {
      return shell.local.syncReceipt;
    },
    get trackingLane(): TrackingLane | undefined {
      if (shell.local.syncLane) return "sync";
      return shell.local.trackingLane === undefined ? undefined : "manual";
    },
    get trackingLaneNeeded(): boolean {
      return shell.laneChoiceNeeded;
    },
  };
}
