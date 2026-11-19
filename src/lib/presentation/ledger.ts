import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { hasSelectiveSeasonCondition } from "#lib/engine/availability-condition.js";
import { getSourceDisclosure, isSourceDoable } from "#lib/engine/availability.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { isWeatherInSeason } from "#lib/engine/world-state.js";

import type { SourceFilterId } from "#lib/data/source-filters.js";
import type { DayContext } from "#lib/engine/availability.js";
import type { Shelf } from "#lib/engine/shelves.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { SourceGroupRow, SourceSection } from "#lib/presentation/source-groups.js";
import type { Source } from "#lib/types/acquisition.js";
import type { Season } from "#lib/types/tracker-data.js";

const sourceFamilies = new Map(
  SOURCE_FILTERS.flatMap(({ id, types }) => types.map((type) => [type, id] as const)),
);

export function ledgerSourceFamily(source: Source): SourceFilterId | undefined {
  return sourceFamilies.get(source.type);
}

export interface LedgerPlacement {
  allSources: readonly Source[];
  completed: boolean;
  doable: boolean;
  hiddenCount: number;
  readySources: readonly Source[];
  seasonalSources: { seasons: Season[]; source: Source }[];
  sources: readonly Source[];
  spoilered: boolean;
  visibleSources: Source[];
}

const seasonsOfYear: readonly Season[] = ["spring", "summer", "fall", "winter"];

export function ledgerPlacement(
  sources: readonly Source[],
  day: DayContext,
  visibility: UserProgressionState,
  { completed, doable, spoilered }: { completed: boolean; doable: boolean; spoilered: boolean },
  allSources = sources,
): LedgerPlacement {
  const { hiddenCount, visibleSources } = spoilered
    ? { hiddenCount: 0, visibleSources: [] }
    : getSourceDisclosure(allSources, visibility);
  const readySources = doable ? sources.filter((source) => isSourceDoable(source, day)) : [];
  const seasonalSources =
    completed || spoilered
      ? []
      : sources.flatMap((source) => {
          const condition = "availability" in source ? source.availability : undefined;
          if (
            !condition ||
            !hasSelectiveSeasonCondition(condition) ||
            readySources.includes(source)
          ) {
            return [];
          }
          const seasons = seasonsOfYear.filter((season) => {
            if (season === day.worldState.season) return false;
            const weather = isWeatherInSeason(day.worldState.weather, season)
              ? day.worldState.weather
              : "calm";
            return isSourceDoable(source, { ...day, worldState: { season, weather } });
          });
          return seasons.length > 0 ? [{ seasons, source }] : [];
        });
  return {
    allSources,
    completed,
    doable,
    hiddenCount,
    readySources,
    seasonalSources,
    sources,
    spoilered,
    visibleSources,
  };
}

export function ledgerShelf(row: LedgerPlacement, showsSource: (source: Source) => boolean): Shelf {
  if (row.completed) return "completed";
  if (row.doable && (row.sources.length === 0 || row.readySources.some(showsSource))) return "todo";
  return "notNow";
}

export function sourceLedgerPlacement<Row extends SourceGroupRow>(
  { doable, entry, sources }: SourceSection<Row>["rows"][number],
  day: DayContext,
): LedgerPlacement {
  const visibility = day.progressionState;
  return ledgerPlacement(
    sources,
    day,
    visibility,
    {
      completed: entry.completed,
      doable: doable && entry.obtainable,
      spoilered: entry.spoilered === true || !isConditionVisible(entry.visibility, visibility),
    },
    entry.sources,
  );
}
