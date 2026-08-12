import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
import type { ItemId, Restriction, Season, Source, Weather } from "$lib/types/tracker-data.js";

// ─── Composite display helpers ───────────────────────────────────────

/**
 * Whether an item row should be visually dimmed — incomplete but unavailable
 * in the current season/weather when viewing "everything".
 */
export function isItemDimmed(
  itemId: ItemId,
  isCompleted: boolean,
  sourcesMap: Partial<Record<ItemId, Source[]>>,
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (isCompleted) return false;
  if (mode !== "everything") return false;
  return !isItemAvailable(itemId, sourcesMap, worldState, "available");
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
 * Whether an item falls within the scoped set used for progress counters.
 * Completed items are always in scope; incomplete items must pass availability.
 * Ignores showCompleted and recentlyCompleted — those affect rendering only.
 */
export function shouldCountItem(
  itemId: ItemId,
  isCompleted: boolean,
  sourcesMap: Partial<Record<ItemId, Source[]>>,
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (isCompleted) return true;
  return isItemAvailable(itemId, sourcesMap, worldState, mode);
}

/**
 * Whether an item should be visible in a list given filter state.
 * Handles the recentlyCompleted linger, showCompleted toggle, and availability.
 */
export function shouldShowItem(
  itemId: ItemId,
  isCompleted: boolean,
  sourcesMap: Partial<Record<ItemId, Source[]>>,
  worldState: WorldState,
  mode: AvailabilityMode,
  showCompleted: boolean,
  recentlyCompleted?: ReadonlySet<ItemId>,
): boolean {
  if (recentlyCompleted?.has(itemId)) return true;
  if (isCompleted && !showCompleted) return false;
  if (isCompleted) return true;
  return isItemAvailable(itemId, sourcesMap, worldState, mode);
}

// ─── Restriction types by taxonomy ─────────────────────────────────

const TIMELY_TYPES = new Set(["season", "time", "weather"]);

const ALL_SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

interface WorldState {
  season: Season;
  weather: Weather;
}

/**
 * Filter a list of item IDs to only those passing availability check.
 */
export function filterAvailableItems(
  itemIds: ItemId[],
  sourcesMap: Partial<Record<ItemId, Source[]>>,
  worldState: WorldState,
  mode: AvailabilityMode,
): ItemId[] {
  if (mode === "everything") return itemIds;
  return itemIds.filter((id) => isItemAvailable(id, sourcesMap, worldState, mode));
}

// ─── Individual restriction matchers ────────────────────────────────

/** Get deduplicated restriction summary for display badges */
export function getItemRestrictions(sources: Source[]): Restriction[] {
  const seen = new Set<string>();
  const result: Restriction[] = [];

  for (const source of sources) {
    for (const r of source.restrictions ?? []) {
      // Dedupe by type + value
      const key = JSON.stringify(r);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(r);
      }
    }
  }

  return result;
}

/**
 * Returns true if the source has a season restriction that excludes at least
 * one season (i.e. it is not year-round). This is the qualification test for
 * "Seasonal" / "timely" mode.
 *
 * - A scalar `season` value always qualifies.
 * - A `seasons` array qualifies only when it does NOT contain all four seasons.
 * - A missing / empty season restriction does not qualify.
 */
export function hasSelectiveSeasonRestriction(source: Source): boolean {
  return (source.restrictions ?? []).some((r) => {
    if (r.type !== "season") return false;
    if (r.season !== undefined) return true;
    const seasons = r.seasons;
    if (!seasons || seasons.length === 0) return false;
    return !ALL_SEASONS.every((s) => seasons.includes(s));
  });
}

// ─── Source-level availability ──────────────────────────────────────

/** Does this source have any timely restriction? */
export function hasTimelyRestriction(source: Source): boolean {
  return (source.restrictions ?? []).some(isTimelyRestriction);
}

/**
 * Check if an item is available: ANY source must pass (OR logic).
 * Items with no sources are always available in "available"/"everything",
 * but hidden in "timely" (nothing is timely about them).
 */
export function isItemAvailable(
  itemId: ItemId,
  sourcesMap: Partial<Record<ItemId, Source[]>>,
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (mode === "everything") return true;

  const sources = sourcesMap[itemId];
  if (!sources || sources.length === 0) {
    // No sources — available but not timely
    return mode === "available";
  }

  return sources.some((source) => isSourceAvailable(source, worldState, mode));
}

// ─── Item-level availability ────────────────────────────────────────

/**
 * Check if a single source is available given world state and mode.
 *
 * - "everything": always true
 * - "available": all timely restrictions must match (ignores spoilable/info)
 * - "timely": source must HAVE a timely restriction AND all timely restrictions must match
 */
export function isSourceAvailable(
  source: Source,
  worldState: WorldState,
  mode: AvailabilityMode,
): boolean {
  if (mode === "everything") return true;

  const restrictions = source.restrictions ?? [];
  const timelyRestrictions = restrictions.filter(isTimelyRestriction);

  if (mode === "timely") {
    // Source must have a selective season restriction to qualify
    if (!hasSelectiveSeasonRestriction(source)) return false;
  }

  // All timely restrictions must match
  return timelyRestrictions.every((r) => {
    switch (r.type) {
      case "animal":
      case "building":
      case "cutscene":
      case "fishSize":
      case "minesLevel":
      case "perk":
      case "randomStock":
      case "relationship":
      case "seenSeason":
      case "skill":
      case "upperFloor":
        // Non-timely restrictions — already filtered out, but needed for exhaustiveness
        return true;
      case "season":
        return seasonMatches(r, worldState.season);
      case "time":
        // Time-of-day not filtered in Phase 3 — always passes
        return true;
      case "weather":
        return weatherMatches(r, worldState.weather);
    }
  });
}

function isTimelyRestriction(r: Restriction): boolean {
  return TIMELY_TYPES.has(r.type);
}

// ─── Display helpers ────────────────────────────────────────────────

function seasonMatches(r: Restriction, season: Season): boolean {
  if (r.seasons) return r.seasons.includes(season);
  if (r.season) return r.season === season;
  return true;
}

function weatherMatches(r: Restriction, weather: Weather): boolean {
  if (r.weathers) return r.weathers.includes(weather);
  return true;
}
