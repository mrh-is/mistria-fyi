import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
import type { AcquisitionSource, ItemId, Season, Weather } from "$lib/types/tracker-data.js";

// ─── Composite display helpers ───────────────────────────────────────

interface WorldState {
  season: Season;
  weather: Weather;
}

/**
 * Filter a list of item IDs to only those passing availability check.
 */
export function filterAvailableItems(
  itemIds: ItemId[],
  sourceLookup: (id: ItemId) => AcquisitionSource[],
  worldState: WorldState,
  mode: AvailabilityMode,
): ItemId[] {
  if (mode === "everything") return itemIds;
  return itemIds.filter((id) => isItemAvailable(sourceLookup(id), worldState, mode));
}

/**
 * Get deduplicated restriction summary for display badges.
 *
 * Stubbed pending Task 2, which replaces this with `getDisplayBadges` built on
 * `AcquisitionSource.availability` (an `AvailabilityCondition` tree) instead of the removed
 * `Restriction[]` shape.
 */
export function getItemRestrictions(_sources: AcquisitionSource[]): never[] {
  return [];
}

/**
 * Returns true if the source has a season restriction that excludes at least one season.
 *
 * Stubbed pending Task 2's `AvailabilityCondition`-based rewrite.
 */
export function hasSelectiveSeasonRestriction(_source: AcquisitionSource): boolean {
  return false;
}

/**
 * Does this source have any timely restriction?
 *
 * Stubbed pending Task 2's `AvailabilityCondition`-based rewrite.
 */
export function hasTimelyRestriction(_source: AcquisitionSource): boolean {
  return false;
}

/**
 * Check if an item is available: ANY source must pass (OR logic).
 * Items with no sources are always available in "available"/"everything",
 * but hidden in "timely" (nothing is timely about them).
 */
export function isItemAvailable(
  sources: AcquisitionSource[],
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

// ─── Restriction-derived helpers (stubbed pending Task 2) ──────────────

/**
 * Whether an item row should be visually dimmed — incomplete but unavailable
 * in the current season/weather when viewing "everything".
 */
export function isItemDimmed(
  sources: AcquisitionSource[],
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
 *
 * Stubbed pending Task 2's `AvailabilityCondition`-based rewrite: everything is available except
 * in "timely" mode, where nothing currently qualifies.
 */
export function isSourceAvailable(
  _source: AcquisitionSource,
  _worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  return mode !== "timely";
}

// ─── Item-level availability ────────────────────────────────────────

/**
 * Whether an item falls within the scoped set used for progress counters.
 * Completed items are always in scope; incomplete items must pass availability.
 * Ignores showCompleted and recentlyCompleted — those affect rendering only.
 */
export function shouldCountItem(
  sources: AcquisitionSource[],
  isCompleted: boolean,
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (isCompleted) return true;
  return isItemAvailable(sources, worldState, mode);
}

// ─── Source-level availability ──────────────────────────────────────

/**
 * Whether an item should be visible in a list given filter state.
 * Handles the recentlyCompleted linger, showCompleted toggle, and availability.
 */
export function shouldShowItem(
  sources: AcquisitionSource[],
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
