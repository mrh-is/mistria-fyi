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
  applySyncedSave: (request: SyncApplyRequest) => Promise<SyncApplyOutcome>;
  cancelLaneChoice: () => void;
  readonly canStartTrackingByHand: boolean;
  chooseSyncTracking: () => void;
  startSyncLane: (
    lane: SyncLane,
    save: SyncedSave,
    stillWanted?: () => boolean,
    stamp?: SyncApplyStamp,
  ) => Promise<boolean>;
  startTrackingByHand: () => Promise<boolean>;
  readonly syncBlocked: boolean;
  readonly syncFreshness: DeepReadonly<SyncFreshness> | undefined;
  readonly syncLane: DeepReadonly<SyncLane> | undefined;
  readonly syncPendingRetires: readonly DeepReadonly<PendingRetire>[];
  readonly syncReceipt: DeepReadonly<SyncReceipt> | undefined;
  readonly trackingLane: TrackingLane | undefined;
  readonly trackingLaneNeeded: boolean;
}

export function createSyncFacade(
  repository: Pick<ProgressRepository, "clockBase" | "enableAfterReplace" | "write" | "writeLocal">,
  shell: SyncShell,
): SyncFacade {
  return {
    ...syncLaneOperations(repository.writeLocal),
    /** Progress, receipt, & any outgoing-farm backup commit in the same locked write. */
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
    /** Stages the first save aside, so a cancelled or failed lane start erases nothing. */
    async startSyncLane(
      lane: SyncLane,
      save: SyncedSave,
      stillWanted: () => boolean = () => true,
      stamp?: SyncApplyStamp,
    ): Promise<boolean> {
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
    /** Commits the manual lane before replaying the hand edit that requested it. */
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
