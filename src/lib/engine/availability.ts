import {
  evaluateAvailabilityCondition,
  extractDisplayBadges,
  hasSelectiveSeasonCondition,
} from "./availability-condition.js";
import { isConditionVisible } from "./visibility.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { ItemId, Season, Weather } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { AvailabilityContext, DisplayBadges } from "./availability-condition.js";
import type { UserProgressionState } from "./visibility.js";

/** What a row's window depends on: today's season & weather, & the player's recorded progress. */
export interface RowWindowContext {
  progressionState: UserProgressionState;
  worldState: { season: Season; weather: Weather };
}

/** A row whose window is decided by its sources & its own spoiler gate. */
export interface WindowedRow {
  sources: readonly Source[];
  visibility?: VisibilityCondition;
}

/**
 * Assign a row to exactly one independently selectable availability window, answering "what can I
 * act on today?". A spoiler-hidden row is "later"; otherwise the row takes the best window among
 * its sources: "now", then "anytime" (shown as “Whenever”), then "later". A row without sources is
 * "anytime".
 */
export function classifyItemAvailability(
  row: WindowedRow,
  ctx: RowWindowContext,
): AvailabilityWindow {
  if (!isConditionVisible(row.visibility, ctx.progressionState)) return "later";
  if (row.sources.length === 0) return "anytime";

  let best: AvailabilityWindow = "later";
  for (const source of row.sources) {
    const window = classifySourceAvailability(source, ctx);
    if (window === "now") return "now";
    if (window === "anytime") best = "anytime";
  }
  return best;
}

/**
 * One source's window. It is "later" while the source is a spoiler, while a progress gate the app
 * records is unmet, or out of the current season or weather. Otherwise it is "now" when a season
 * or weather restriction holds today, & "anytime" when nothing restricts it. Gates the app can't
 * evaluate (game predicates, date unlocks) count as met, & time of day is never filtered on.
 */
export function classifySourceAvailability(
  source: Source,
  ctx: RowWindowContext,
): AvailabilityWindow {
  if (!isConditionVisible(getSourceVisibility(source), ctx.progressionState)) return "later";

  const availability = getAvailabilityCondition(source);
  if (!availability) return "anytime";

  const progress = progressContext(ctx.progressionState);
  if (evaluateAvailabilityCondition(availability, { ...progress, ...ctx.worldState }) === false) {
    return "later";
  }
  // Met whatever today's season & weather, such as a gate that only offers an alternative to one.
  if (evaluateAvailabilityCondition(availability, progress) === true) return "anytime";
  return hasWindowRestriction(availability) ? "now" : "anytime";
}

// ─── Source-level availability ──────────────────────────────────────

/**
 * Get a merged, deduplicated set of display badges from a list of sources.
 */
export function getDisplayBadges(sources: Source[]): DisplayBadges {
  const merged: DisplayBadges = {};
  for (const source of sources) {
    const availability = getAvailabilityCondition(source);
    if (!availability) continue;
    const badges = extractDisplayBadges(availability);
    if (badges.seasons && !merged.seasons) merged.seasons = badges.seasons;
    if (badges.weathers && !merged.weathers) merged.weathers = badges.weathers;
    if (badges.timeRange && !merged.timeRange) merged.timeRange = badges.timeRange;
  }
  return merged;
}

// ─── Item-level availability ────────────────────────────────────────

/**
 * Whether a row's window is among the selected ones. Rows with no sources classify as "anytime",
 * so they pass whenever "anytime" is selected.
 */
export function isItemAvailable(
  row: WindowedRow,
  ctx: RowWindowContext,
  windows: readonly AvailabilityWindow[],
): boolean {
  return windows.includes(classifyItemAvailability(row, ctx));
}

// ─── Composite display helpers ───────────────────────────────────────

/**
 * Whether an item row should be visually dimmed: incomplete & "later" while "later" is selected
 * alongside another window.
 */
export function isItemDimmed(
  row: WindowedRow,
  isCompleted: boolean,
  ctx: RowWindowContext,
  windows: readonly AvailabilityWindow[],
): boolean {
  if (isCompleted) return false;
  if (!windows.includes("later") || !windows.some((window) => window !== "later")) return false;
  return classifyItemAvailability(row, ctx) === "later";
}

/**
 * Whether a scoped row (an item, or another tracked id such as a recipe) should be rendered.
 * A row is visible when it is not completed, showCompleted is true,
 * or it is in the recentlyCompleted linger set.
 */
export function isRowVisible<Id extends string = ItemId>(
  id: Id,
  isCompleted: boolean,
  showCompleted: boolean,
  recentlyCompleted?: ReadonlySet<Id>,
): boolean {
  if (recentlyCompleted?.has(id)) return true;
  return !isCompleted || showCompleted;
}

/**
 * Whether an item falls within the scoped set used for progress counters.
 * Completed items are always in scope; incomplete items must pass availability.
 * Ignores showCompleted and recentlyCompleted — those affect rendering only.
 */
export function isInProgressScope(
  row: WindowedRow,
  isCompleted: boolean,
  ctx: RowWindowContext,
  windows: readonly AvailabilityWindow[],
): boolean {
  if (isCompleted) return true;
  return isItemAvailable(row, ctx, windows);
}

/**
 * Source variants that carry no `SourceDetails` (e.g. `{ type: "default" }`) have no
 * `availability` field at all, so it can't be accessed directly on the union type.
 */
function getAvailabilityCondition(source: Source): AvailabilityCondition | undefined {
  return "availability" in source ? source.availability : undefined;
}

function getSourceVisibility(source: Source): undefined | VisibilityCondition {
  return "visibility" in source ? source.visibility : undefined;
}

/** Whether a season or weather restriction applies. Time of day is a badge, not a window. */
function hasWindowRestriction(condition: AvailabilityCondition): boolean {
  switch (condition.type) {
    case "all":
    case "any":
      return condition.conditions.some(hasWindowRestriction);
    case "always":
    case "dateUnlocked":
    case "gamePredicate":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "mineFloor":
    case "perkUnlocked":
    case "quest":
    case "reachedSeason":
    case "skillLevel":
    case "time":
      return false;
    case "not":
      return hasWindowRestriction(condition.condition);
    case "season":
      return hasSelectiveSeasonCondition(condition);
    case "weather":
      return true;
  }
}

/**
 * The progress facts the app records, as evaluator lookups. Unrecorded levels are zero & quests
 * outside the player's reach are "unavailable", so neither reads as an unknown, met gate.
 */
function progressContext(state: UserProgressionState): AvailabilityContext {
  return {
    hasUpperFloor: state.hasUpperFloor,
    heartLevels: { get: (villagerId) => state.heartLevels[villagerId] ?? 0 },
    isDating: state.isDating,
    mineFloor: state.mineFloor,
    questStates: { get: (questId) => state.questVisibility[questId] },
    reachedSeason: state.reachedSeason,
    skillLevels: { get: (skillId) => state.skillLevels[skillId] ?? 0 },
    unlockedPerks: state.unlockedPerks,
  };
}
