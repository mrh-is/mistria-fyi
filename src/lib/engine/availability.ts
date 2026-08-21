import {
  evaluateAvailabilityCondition,
  extractDisplayBadges,
  hasSelectiveSeasonCondition,
  hasTimelyCondition,
} from "./availability-condition.js";

import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
import type { AvailabilityCondition, Source } from "$lib/types/acquisition.js";
import type { ItemId, Season, Weather } from "$lib/types/tracker-data.js";

import type { DisplayBadges } from "./availability-condition.js";

interface WorldState {
  season: Season;
  weather: Weather;
}

/**
 * Filter a list of item IDs to only those passing availability check.
 */
export function filterAvailableItems(
  itemIds: ItemId[],
  sourceLookup: (id: ItemId) => Source[],
  worldState: WorldState,
  mode: AvailabilityMode,
): ItemId[] {
  if (mode === "everything") return itemIds;
  return itemIds.filter((id) => isItemAvailable(sourceLookup(id), worldState, mode));
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

/**
 * Whether the source has a season condition that excludes at least one season.
 */
export function hasSelectiveSeasonRestriction(source: Source): boolean {
  const availability = getAvailabilityCondition(source);
  return availability !== undefined && hasSelectiveSeasonCondition(availability);
}

/**
 * Does this source have any timely (season/weather/time) condition?
 */
export function hasTimelyRestriction(source: Source): boolean {
  const availability = getAvailabilityCondition(source);
  return availability !== undefined && hasTimelyCondition(availability);
}

// ─── Item-level availability ────────────────────────────────────────

/**
 * Check if an item is available: ANY source must pass (OR logic).
 * Items with no sources are always available in "available"/"everything",
 * but hidden in "timely" (nothing is timely about them).
 */
export function isItemAvailable(
  sources: Source[],
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (mode === "everything") return true;

  if (sources.length === 0) {
    // No sources — available but not timely
    return mode === "available";
  }

  return sources.some((source) => isSourceAvailable(source, worldState, mode));
}

// ─── Composite display helpers ───────────────────────────────────────

/**
 * Whether an item row should be visually dimmed — incomplete but unavailable
 * in the current season/weather when viewing "everything".
 */
export function isItemDimmed(
  sources: Source[],
  isCompleted: boolean,
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (isCompleted) return false;
  if (mode !== "everything") return false;
  return !isItemAvailable(sources, worldState, "available");
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
  mode: AvailabilityMode,
): boolean {
  if (mode === "everything") return true;
  const availability = getAvailabilityCondition(source);
  if (!availability) return mode === "available";

  if (mode === "timely") {
    if (!hasSelectiveSeasonCondition(availability)) return false;
  }

  const result = evaluateAvailabilityCondition(availability, {
    season: worldState.season,
    weather: worldState.weather,
  });
  return result !== false;
}

/**
 * Whether an item falls within the scoped set used for progress counters.
 * Completed items are always in scope; incomplete items must pass availability.
 * Ignores showCompleted and recentlyCompleted — those affect rendering only.
 */
export function shouldCountItem(
  sources: Source[],
  isCompleted: boolean,
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (isCompleted) return true;
  return isItemAvailable(sources, worldState, mode);
}

/**
 * Whether an item should be visible in a list given filter state.
 * Handles the recentlyCompleted linger, showCompleted toggle, and availability.
 */
export function shouldShowItem(
  sources: Source[],
  isCompleted: boolean,
  worldState: WorldState,
  mode: AvailabilityMode,
  showCompleted: boolean,
  isRecentlyCompleted = false,
): boolean {
  if (isRecentlyCompleted) return true;
  if (isCompleted && !showCompleted) return false;
  if (isCompleted) return true;
  return isItemAvailable(sources, worldState, mode);
}

/**
 * Source variants that carry no `SourceDetails` (e.g. `{ type: "default" }`) have no
 * `availability` field at all, so it can't be accessed directly on the union type.
 */
function getAvailabilityCondition(source: Source): AvailabilityCondition | undefined {
  return "availability" in source ? source.availability : undefined;
}
