import { applyAdditiveSave } from "#lib/engine/save-progress.js";
import { nextFreshness } from "#lib/engine/sync-freshness.js";
import { applySaveDay } from "#lib/engine/world-state.js";

import type { ProgressHistory } from "#lib/engine/provenance.js";
import type { WorldDay } from "#lib/engine/world-state.js";
import type { SaveImportMetadata } from "#lib/types/save-identity.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type {
  DeviceLocalState,
  PendingRetire,
  SharedCode,
  SyncApplyStamp,
  SyncedSave,
  SyncLane,
} from "./lane-state.js";

/** The `local` slots an applied save advances, which only an applying write may set. */
export function stampedLocal(
  previous: DeviceLocalState["syncFreshness"],
  { gameDate, modified, receipt }: SyncApplyStamp,
): Pick<DeviceLocalState, "syncFreshness" | "syncReceipt"> {
  return {
    syncFreshness: nextFreshness(previous, modified, gameDate),
    syncReceipt: { ...receipt },
  };
}

function withRetire(
  pending: readonly PendingRetire[] | undefined,
  retire: PendingRetire | undefined,
): PendingRetire[] | undefined {
  if (retire === undefined) return pending === undefined ? undefined : [...pending];
  const others = (pending ?? []).filter((entry) => entry.mailboxId !== retire.mailboxId);
  return [...others, { ...retire }];
}

/** The first save for a lane starts from fresh progress, before anything is published. */
export function stageSyncSave(
  staged: {
    history: ProgressHistory;
    lastImport: null | SaveImportMetadata;
    progress: ProgressState;
    worldState: WorldDay;
  },
  save: SyncedSave,
  world: WorldDay,
): void {
  staged.lastImport = save.metadata;
  applyAdditiveSave(staged.progress, staged.history, save.completed, save.playtime);
  staged.worldState = applySaveDay(world, save.day);
}

/** A lane start replaces the old lane and receipt while keeping unrelated local data. */
export function startLaneLocal(
  stored: DeviceLocalState,
  lane: SyncLane,
  stamp: SyncApplyStamp | undefined,
): DeviceLocalState {
  const { syncFreshness: _freshness, syncLane: _lane, syncReceipt: _receipt, ...kept } = stored;
  return { ...kept, ...(stamp && stampedLocal(undefined, stamp)), syncLane: lane };
}

type LocalPatch = (stored: DeepReadonly<DeviceLocalState>) => DeviceLocalState | undefined;
interface RetiredCode {
  code: SharedCode;
  retire: PendingRetire;
}

interface SyncLaneOperations {
  confirmRetired: (confirmed: readonly PendingRetire[]) => Promise<boolean>;
  setSharedCode: (code: SharedCode, replaced?: RetiredCode) => Promise<boolean>;
  stopSyncing: (stopped?: RetiredCode) => Promise<boolean>;
  switchFollowKey: (key: string, stillWanted?: () => boolean) => Promise<boolean>;
}

/** Applies lane changes through the store's locked local-only write. */
export function syncLaneOperations(
  writeLocal: (update: LocalPatch) => Promise<boolean>,
): SyncLaneOperations {
  return {
    /** Forgets the retires the relay has confirmed. */
    confirmRetired(confirmed: readonly PendingRetire[]): Promise<boolean> {
      return writeLocal((stored) => {
        const pending = stored.syncPendingRetires ?? [];
        const left = pending.filter(
          (retire) => !confirmed.some((done) => done.mailboxId === retire.mailboxId),
        );
        if (left.length === pending.length) return undefined;
        const { syncPendingRetires: _pending, ...kept } = structuredClone(
          stored,
        ) as DeviceLocalState;
        return left.length > 0 ? { ...kept, syncPendingRetires: [...left] } : kept;
      });
    },
    /**
     * Records the code the computer lane now shares. A code it replaces joins the pending retires
     * in the same write, so the old code is retired only once the new one is stored. Resolves
     * with whether that write landed.
     */
    setSharedCode(code: SharedCode, replaced?: RetiredCode): Promise<boolean> {
      return writeLocal((stored) => {
        // Only the code this change replaces may be replaced: a code another tab stored meanwhile
        // would otherwise stay live with nothing left to retire it.
        const lane = stored.syncLane;
        if (lane?.kind !== "computer" || lane.code?.key !== replaced?.code.key) return undefined;
        const current = structuredClone(stored) as DeviceLocalState;
        return {
          ...current,
          syncLane: { code: { ...code }, kind: "computer" },
          syncPendingRetires: withRetire(current.syncPendingRetires, replaced?.retire),
        };
      });
    },
    /**
     * Returns the device to tracking by hand, keeping progress & history: only the receipt, the
     * lane, & its key go. A code the computer shared joins the pending retires in the same write,
     * so it's retired only once leaving has landed. Resolves with whether that write landed.
     */
    stopSyncing(stopped?: RetiredCode): Promise<boolean> {
      return writeLocal((stored) => {
        const lane = stored.syncLane;
        const storedCode = lane?.kind === "computer" ? lane.code?.key : undefined;
        if (storedCode !== stopped?.code.key) return undefined;
        const current = structuredClone(stored) as DeviceLocalState;
        const {
          syncFreshness: _freshness,
          syncLane: _lane,
          syncReceipt: _receipt,
          ...kept
        } = current;
        return {
          ...kept,
          syncPendingRetires: withRetire(kept.syncPendingRetires, stopped?.retire),
        };
      });
    },
    /** Follows another code without leaving the lane; the next save applies with the usual rules. */
    switchFollowKey(key: string, stillWanted: () => boolean = () => true): Promise<boolean> {
      return writeLocal((stored) => {
        if (!stillWanted() || stored.syncLane?.kind !== "following") return undefined;
        const current = structuredClone(stored) as DeviceLocalState;
        const { syncReceipt: _receipt, ...kept } = current;
        return { ...kept, syncLane: { key, kind: "following" } };
      });
    },
  };
}
