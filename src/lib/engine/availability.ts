import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import {
  evaluateAvailabilityCondition,
  extractDisplayBadges,
  hasSelectiveSeasonCondition,
} from "./availability-condition.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { ItemId, Season, Weather } from "#lib/types/tracker-data.js";

import type { DisplayBadges } from "./availability-condition.js";

interface WorldState {
  season: Season;
  weather: Weather;
}

/** Assign an item to exactly one independently selectable availability window. */
export function classifyItemAvailability(
  sources: Source[],
  worldState: WorldState,
): AvailabilityWindow {
  if (sources.length === 0) return "anytime";

  const sourceWindows = new Set(
    sources.map((source) => classifySourceAvailability(source, worldState)),
  );
  if (sourceWindows.has("anytime")) return "anytime";
  if (sourceWindows.has("now")) return "now";
  return "later";
}

// ─── Source-level availability ──────────────────────────────────────

/**
 * Filter a list of item IDs to only those passing availability check.
 */
export function filterAvailableItems(
  itemIds: ItemId[],
  sourceLookup: (id: ItemId) => Source[],
  worldState: WorldState,
  windows: readonly AvailabilityWindow[],
): ItemId[] {
  if (AVAILABILITY_WINDOWS.every((window) => windows.includes(window))) return itemIds;
  return itemIds.filter((id) => isItemAvailable(sourceLookup(id), worldState, windows));
}

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
 * Check if an item is available: ANY source must pass (OR logic).
 * Items with no sources classify as "anytime", so they pass whenever "anytime" is selected.
 */
export function isItemAvailable(
  sources: Source[],
  worldState: WorldState,
  windows: readonly AvailabilityWindow[],
): boolean {
  return windows.includes(classifyItemAvailability(sources, worldState));
}

// ─── Composite display helpers ───────────────────────────────────────

/**
 * Whether an item row should be visually dimmed — incomplete but unavailable
 * in the current season/weather while "later" is selected alongside another window.
 */
export function isItemDimmed(
  sources: Source[],
  isCompleted: boolean,
  worldState: WorldState,
  windows: readonly AvailabilityWindow[],
): boolean {
  if (isCompleted) return false;
  if (!windows.includes("later") || !windows.some((window) => window !== "later")) return false;
  return classifyItemAvailability(sources, worldState) === "later";
}

/**
 * Whether a scoped item row should be rendered.
 * An item is visible when it is not completed, showCompleted is true,
 * or it is in the recentlyCompleted linger set.
 */
export function isRowVisible(
  itemId: ItemId,
  isCompleted: boolean,
  showCompleted: boolean,
  recentlyCompleted?: ReadonlySet<ItemId>,
): boolean {
  if (recentlyCompleted?.has(itemId)) return true;
  return !isCompleted || showCompleted;
}

/**
 * Check if a single source is available given world state and mode.
 */
export function isSourceAvailable(
  source: Source,
  worldState: WorldState,
  windows: readonly AvailabilityWindow[],
): boolean {
  return windows.includes(classifySourceAvailability(source, worldState));
}

/**
 * Whether an item falls within the scoped set used for progress counters.
 * Completed items are always in scope; incomplete items must pass availability.
 * Ignores showCompleted and recentlyCompleted — those affect rendering only.
 */
export function isInProgressScope(
  sources: Source[],
  isCompleted: boolean,
  worldState: WorldState,
  windows: readonly AvailabilityWindow[],
): boolean {
  if (isCompleted) return true;
  return isItemAvailable(sources, worldState, windows);
}

function classifySourceAvailability(source: Source, worldState: WorldState): AvailabilityWindow {
  const availability = getAvailabilityCondition(source);
  if (!availability || !hasWindowRestriction(availability)) return "anytime";

  const result = evaluateAvailabilityCondition(availability, {
    season: worldState.season,
    weather: worldState.weather,
  });
  return result === false ? "later" : "now";
}

/**
 * Source variants that carry no `SourceDetails` (e.g. `{ type: "default" }`) have no
 * `availability` field at all, so it can't be accessed directly on the union type.
 */
function getAvailabilityCondition(source: Source): AvailabilityCondition | undefined {
  return "availability" in source ? source.availability : undefined;
}

function hasWindowRestriction(condition: AvailabilityCondition): boolean {
  switch (condition.type) {
    case "all":
    case "any":
      return condition.conditions.some(hasWindowRestriction);
    case "always":
    case "gamePredicate":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "mineFloor":
    case "perkUnlocked":
    case "quest":
    case "reachedSeason":
    case "skillLevel":
      return false;
    case "not":
      return hasWindowRestriction(condition.condition);
    case "season":
      return hasSelectiveSeasonCondition(condition);
    case "time":
    case "weather":
      return true;
  }
}
