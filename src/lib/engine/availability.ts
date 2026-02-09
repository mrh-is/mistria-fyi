import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
import type { ItemId, Restriction, Season, Source, Weather } from "$lib/types/tracker-data.js";

// ─── Restriction types by taxonomy ─────────────────────────────────

const TIMELY_TYPES = new Set(["season", "time", "weather"]);

interface WorldState {
  season: Season;
  weather: Weather;
}

// ─── Individual restriction matchers ────────────────────────────────

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
    // Source must have at least one timely restriction to be relevant
    if (timelyRestrictions.length === 0) return false;
  }

  // All timely restrictions must match
  return timelyRestrictions.every((r) => {
    switch (r.type) {
      case "animal":
      case "building":
      case "fishSize":
      case "perk":
      case "randomStock":
      case "seenSeason":
      case "skill":
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
