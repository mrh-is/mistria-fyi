import { projectSourceChecklist } from "#lib/controllers/source-checklist.js";
import { trackerData } from "#lib/data/index.js";
import { getDisplayBadges } from "#lib/engine/availability.js";
import { projectQuests } from "#lib/engine/projections/quests.js";
import { ledgerShelf, sourceLedgerPlacement } from "#lib/presentation/ledger.js";
import { projectSourceGroups } from "#lib/presentation/source-groups.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { SourceGroupRow, SourceSection } from "#lib/presentation/source-groups.js";
import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";

// Roughly 20% above Spring 1 in the day-one fixture. The fixture tests also bound later saves.
export const HOME_PLACES_WARNING_LIMIT = 1010;

const QUEST_STARTS = new Map(
  Object.values(trackerData.quests).flatMap((quests) => Object.entries(quests)),
);

// These shops are the visiting vendors at the Saturday Market. The ledger already checks each
// store's unlock; Home also knows whether the weekly market is on.
const MARKET_STALLS = new Set(["darcy", "louis", "merri", "vera", "wheedle", "zorel"]);
const FREE_GATHERING = new Set([
  "forage",
  "fish",
  "dive",
  "bug_catch",
  "artifact_dig",
  "mines_dig_site",
  "mine_fish",
  "mine",
]);

function dependsOnSeason(condition: AvailabilityCondition | undefined): boolean {
  if (!condition) return false;
  if (condition.type === "all" || condition.type === "any") {
    return condition.conditions.some(dependsOnSeason);
  }
  if (condition.type === "not") return dependsOnSeason(condition.condition);
  if (condition.type === "gamePredicate") {
    return condition.predicate === "is_day_type" || condition.predicate === "reached_date";
  }
  return condition.type === "season" || condition.type === "weather";
}

function whenKnown(source: Source): boolean {
  return !("availability" in source && dependsOnSeason(source.availability));
}

function placeRank(
  section: SourceSection<SourceGroupRow>,
  ctx: ProgressContext,
): number | undefined {
  const { source } = section;
  if (!source) return undefined;
  const { day } = ctx.worldState;
  if (section.group === "festivals") return day === undefined ? undefined : 0;
  if (section.group === "stores" && "storeId" in source && source.storeId) {
    if (MARKET_STALLS.has(source.storeId)) {
      return day !== undefined && day % 7 === 6 ? 0 : undefined;
    }
    const seasons = section.rows.flatMap(({ sources }) =>
      sources.map((stock) => getDisplayBadges([stock]).seasons),
    );
    if (
      seasons.length > 0 &&
      seasons.every((entry) => entry?.length === 1 && entry[0] === seasons[0]?.[0])
    ) {
      return day === undefined ? undefined : 0;
    }
    return 3;
  }
  if (FREE_GATHERING.has(source.type)) return 2;
  if (source.type === "station") return 4;
  return undefined;
}

export interface HomePlaces {
  places: { count: number; id: string; rank: number; source?: Source }[];
  total: number;
}

export function projectHomePlaces(ctx: ProgressContext): HomePlaces {
  const open = new Set<string>();
  const places = projectSourceGroups(projectSourceChecklist(ctx), ctx).flatMap((section) => {
    const rank = placeRank(section, ctx);
    if (section.spoilered || rank === undefined || !section.source) return [];
    const showsSource = ctx.worldState.day === undefined ? whenKnown : () => true;
    let count = 0;
    for (const row of section.rows) {
      if (ledgerShelf(sourceLedgerPlacement(row, ctx), showsSource) !== "todo") continue;
      open.add(row.entry.key);
      count += 1;
    }
    return count > 0 ? [{ count, id: section.id, rank, source: section.source }] : [];
  });

  // The source ledger files fetch quests under their item sources and story quests under
  // Progress. The quest section in category view brings all currently available quests together.
  const quests = projectQuests(ctx).rows.filter(
    ({ completed, doable, id }) =>
      !completed &&
      doable &&
      ctx.progress.questStates[id] !== "obtained" &&
      (ctx.worldState.day !== undefined || !dependsOnSeason(QUEST_STARTS.get(id)?.startCondition)),
  );
  for (const { id } of quests) open.add(`quests:quest:${id}`);
  const questPlace =
    quests.length === 0 ? [] : [{ count: quests.length, id: "quests", rank: 1, source: undefined }];

  return {
    places: [...places, ...questPlace].toSorted(
      (a, b) => a.rank - b.rank || b.count - a.count || a.id.localeCompare(b.id),
    ),
    total: open.size,
  };
}
