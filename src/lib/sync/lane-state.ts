import * as v from "valibot";

import { SEASONS } from "#lib/types/tracker-data.js";

import type { GameDate } from "#lib/engine/game-calendar.js";
import type { SaveExtraction } from "#lib/engine/import-save.js";
import type { SyncAnswers, SyncQuestion, SyncReceipt, SyncResult } from "#lib/engine/sync-apply.js";
import type { SaveDay } from "#lib/engine/world-state.js";
import type { SaveImportMetadata } from "#lib/types/save-identity.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

const FiniteNumberSchema = v.pipe(v.number(), v.finite());

const SyncSecretSchema = v.pipe(v.string(), v.regex(/^[\w-]{43}$/u));

/**
 * The device's sync lane (`docs/sync.md` § Following). Tracking by hand, the default, has none. The
 * computer lane holds the code it shares, once its mailbox exists; a following lane, the key it
 * follows.
 */
const SyncLaneSchema = v.variant("kind", [
  v.object({
    code: v.optional(v.object({ key: SyncSecretSchema, token: SyncSecretSchema })),
    kind: v.literal("computer"),
  }),
  v.object({ key: SyncSecretSchema, kind: v.literal("following") }),
]);
export type SyncLane = v.InferOutput<typeof SyncLaneSchema>;

/** A code waiting for the relay to confirm its retirement: its mailbox & write token. */
const PendingRetireSchema = v.object({
  mailboxId: v.pipe(v.string(), v.regex(/^[\w-]{22}$/u)),
  token: SyncSecretSchema,
});

/** What this device last applied; see `receiptCovers` in `sync-apply.ts`. */
const SyncReceiptSchema = v.object({
  counter: v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(1))),
  hash: SyncSecretSchema,
  mailboxId: v.optional(v.pipe(v.string(), v.regex(/^[\w-]{22}$/u))),
});

/** The last save file's time & date, & the gaps learned between saves; see `sync-freshness.ts`. */
const SyncFreshnessSchema = v.object({
  gameDate: v.optional(
    v.object({
      day: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
      season: v.picklist(SEASONS),
      year: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
    }),
  ),
  gaps: v.array(v.pipe(FiniteNumberSchema, v.minValue(0))),
  modified: v.pipe(FiniteNumberSchema, v.minValue(0)),
});

/**
 * How this device tracks (`docs/app-architecture.md` § Tracking lanes): by hand, or by syncing a
 * save file. Nothing is recorded by hand until a lane is chosen. A device with a sync lane is on
 * the sync lane whatever this says.
 */
export const TRACKING_LANES = ["manual", "sync"] as const;
export type TrackingLane = (typeof TRACKING_LANES)[number];

const TimestampSchema = v.pipe(FiniteNumberSchema, v.minValue(0));
const FactCountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));

/**
 * The reminders this device has shown; see `tracking-reminders.ts`. `install` is the home-screen
 * nudge: when it last showed & a fingerprint of progress then, or `dismissed` once the player says
 * they've installed the app. `backupFacts` is how many facts progress held when a backup was last
 * suggested or downloaded.
 */
const TrackingRemindersSchema = v.object({
  backupFacts: v.fallback(v.optional(FactCountSchema), undefined),
  install: v.fallback(
    v.optional(
      v.object({
        dismissed: v.optional(v.literal(true)),
        fingerprint: v.optional(v.string()),
        shownAt: v.optional(TimestampSchema),
      }),
    ),
    undefined,
  ),
});
export type TrackingReminders = v.InferOutput<typeof TrackingRemindersSchema>;

/**
 * This device's own data under the progress key, which never leaves it: exports leave it out and
 * a restore keeps this device's. Its slots: `syncReceipt` (what this device last applied),
 * `syncFreshness` (when the last save came), `farmSwitchBackup` (progress saved before switching
 * farms), `syncLane` (the lane & its key), `syncPendingRetires` (codes still to retire),
 * `trackingLane` (by hand or by sync, since version 9), & `reminders` (the data-loss reminders
 * shown). The backup is carried through as stored & read with the progress codec. A malformed
 * lane, retire list, receipt, freshness, or reminder record is dropped rather than quarantining
 * progress; losing a receipt only applies the latest save again.
 */
export const DeviceLocalSchema = v.looseObject({
  farmSwitchBackup: v.optional(v.unknown()),
  reminders: v.fallback(v.optional(TrackingRemindersSchema), undefined),
  syncFreshness: v.fallback(v.optional(SyncFreshnessSchema), undefined),
  syncLane: v.fallback(v.optional(SyncLaneSchema), undefined),
  syncPendingRetires: v.fallback(v.optional(v.array(PendingRetireSchema)), undefined),
  syncReceipt: v.fallback(v.optional(SyncReceiptSchema), undefined),
  trackingLane: v.fallback(v.optional(v.picklist(TRACKING_LANES)), undefined),
});
export type DeviceLocalState = v.InferOutput<typeof DeviceLocalSchema>;

/** A save file read for sync: the progress it records, its day, its farm, & its playtime. */
export interface SyncedSave {
  completed: Partial<ProgressState>;
  day: SaveDay;
  metadata: SaveImportMetadata;
  playtime: number | undefined;
}

/** What an applied save leaves in `local`: its receipt & when it came. */
export interface SyncApplyStamp {
  gameDate: GameDate | undefined;
  modified: number;
  receipt: SyncReceipt;
}

/** A save to apply through the single write path, with the answers given so far. */
export interface SyncApplyRequest extends SyncApplyStamp {
  answers: SyncAnswers;
  day: SaveDay;
  extraction: SaveExtraction;
  metadata: SaveImportMetadata;
  /** The lane this save belongs to. Any other stored lane (stopped, or another code) refuses it. */
  wantsLane: (lane: DeepReadonly<SyncLane> | undefined) => boolean;
}

/** {@link SyncQuestion}s, & the one question the write itself asks before it replaces a backup. */
export type SyncApplyQuestion =
  | Exclude<SyncQuestion, { kind: "farm" }>
  | { farmName: null | string; id: string; kind: "farm" }
  | { farmName: null | string; id: string; kind: "replace-backup"; savedAt: number };

/**
 * What a sync apply did. Only `applied` wrote anything:
 *
 * - `ask`: nothing changes until these are answered.
 * - `blocked`: the store is quarantined or holds a newer build's data.
 * - `skipped`: the receipt already covers this save.
 * - `stale`: the stored lane no longer wants this save.
 * - `switch-failed`: another farm's save, whose backup couldn't be written, so no switch happened.
 * - `write-failed`: storage refused the write.
 */
export type SyncApplyOutcome =
  | { kind: "applied"; result: SyncResult }
  | { kind: "ask"; questions: SyncApplyQuestion[] }
  | { kind: "blocked" | "skipped" | "stale" | "switch-failed" | "write-failed" };

/** The code a computer lane shares: its key & the write token only that device holds. */
export type SharedCode = NonNullable<Extract<SyncLane, { kind: "computer" }>["code"]>;

/** A code waiting for the relay to confirm it's retired. */
export type PendingRetire = NonNullable<DeviceLocalState["syncPendingRetires"]>[number];
