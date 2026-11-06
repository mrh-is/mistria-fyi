/**
 * How fresh a syncing device's progress is: the last save file's time & in-game date, & the gaps
 * it has learned to expect between saves. Pure: the store keeps the result beside the receipt. See
 * `docs/sync.md` § Freshness.
 */
import { gameDateAt } from "#lib/engine/game-calendar.js";

import type { GameDate } from "#lib/engine/game-calendar.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type { SaveBundle } from "./save-bundle.js";

const MS_PER_DAY = 86_400_000;

/** How many gaps a device remembers, enough to span a few play sessions & the days between them. */
export const REMEMBERED_GAPS = 32;
/** A gap is never “abnormal” below this, however regularly the player has been playing. */
export const MIN_ABNORMAL_GAP_DAYS = 3;
/** A gap is abnormal once it's this many times the longest gap the device remembers. */
export const ABNORMAL_GAP_FACTOR = 2;

export interface SyncFreshness {
  gameDate?: GameDate;
  /** The gaps between recent saves' times, oldest first, in milliseconds. */
  gaps: number[];
  /** The last save file's modification time, in Unix milliseconds. */
  modified: number;
}

/** The save's calendar date, or `undefined` when it holds no readable one. */
export function readGameDate(bundle: SaveBundle): GameDate | undefined {
  const raw = bundle.gamedata?.date;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return undefined;
  return gameDateAt(raw);
}

/** The freshness after a save arrives. A save re-sent unchanged teaches nothing about gaps. */
export function nextFreshness(
  previous: DeepReadonly<SyncFreshness> | undefined,
  modified: number,
  gameDate: GameDate | undefined,
): SyncFreshness {
  const gaps = previous ? [...previous.gaps] : [];
  if (previous && modified > previous.modified) gaps.push(modified - previous.modified);
  return {
    ...(gameDate ? { gameDate } : {}),
    gaps: gaps.slice(-REMEMBERED_GAPS),
    modified,
  };
}

/**
 * How many whole days the device has gone without a save, when that's abnormally long for it, or
 * `undefined`. A clock behind the gaming computer's only makes the gap look shorter.
 */
export function abnormalGapDays(
  freshness: DeepReadonly<SyncFreshness> | undefined,
  now: number,
): number | undefined {
  if (!freshness) return undefined;
  const gap = now - freshness.modified;
  const threshold = Math.max(
    MIN_ABNORMAL_GAP_DAYS * MS_PER_DAY,
    ABNORMAL_GAP_FACTOR * Math.max(0, ...freshness.gaps),
  );
  return gap >= threshold ? Math.floor(gap / MS_PER_DAY) : undefined;
}
