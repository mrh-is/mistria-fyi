import { trackerData } from "#lib/data/index.js";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { classifyItemAvailability } from "#lib/engine/availability.js";
import { isConditionVisible } from "#lib/engine/visibility.js";

import type { SourceFilterId } from "#lib/data/source-filters.js";
import type { RowWindowContext } from "#lib/engine/availability.js";
import type { Source } from "#lib/types/acquisition.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

export type SourceTypeGroup = "gifts" | "monsters" | "quests" | SourceFilterId;

/** The first eight groups follow the agreed order of use; other acquisition types follow. */
export const SOURCE_TYPE_ORDER: readonly SourceTypeGroup[] = [
  "stores",
  "festivals",
  "gathering",
  "fishing",
  "mines",
  "quests",
  "gifts",
  "monsters",
  "crafting",
  "farming",
  "chests",
  "museum",
  "offerings",
  "perks",
  "dating",
  "progress",
];

export interface SourceInstance {
  group: SourceTypeGroup;
  id: string;
  source?: Source;
}

export interface SourceGroupRow {
  completed: boolean;
  key: string;
  obtainable: boolean;
  sources: Source[];
  spoilered?: boolean;
  visibility?: VisibilityCondition;
}

export interface SourceSection<Row extends SourceGroupRow> extends SourceInstance {
  completed: number;
  rows: { entry: Row; sources: Source[]; window: AvailabilityWindow }[];
  spoilered: boolean;
  state: "done" | "later" | "now";
  total: number;
}

/**
 * Instances ignore stock facets, costs, & gates. A multi-location source is narrowed to one
 * location in each placement; facets of the same instance are reunited before taking a window.
 */
export function sourceInstances(source: Source): SourceInstance[] {
  const instance = (
    id: string,
    group: SourceTypeGroup,
    narrowed: Source = source,
  ): SourceInstance => ({ group, id, source: narrowed });
  if ("storeId" in source && source.type !== "festival") {
    return [instance(`store-${source.storeId}`, "stores")];
  }
  if ("festivalId" in source) return [instance(`festival-${source.festivalId}`, "festivals")];
  if ("biomeId" in source && source.biomeId) return [instance(`mine-${source.biomeId}`, "mines")];
  if ("locationIds" in source && source.locationIds) {
    return source.locationIds.map((id) =>
      instance(`${source.type}-${id}`, "gathering", { ...source, locationIds: [id] }),
    );
  }
  if ("waterTypes" in source && source.waterTypes) {
    return source.waterTypes.map((id) =>
      instance(`${source.type}-${id}`, "fishing", { ...source, waterTypes: [id] }),
    );
  }
  if ("monsterId" in source) return [instance(`monster-${source.monsterId}`, "monsters")];
  if (source.type === "quest") return [instance(`quest-${source.questId}`, "quests")];
  if (source.type === "spouseGift" || source.type === "proposal") {
    return [instance(`${source.type}-${source.villagerId}`, "gifts")];
  }
  const filter = SOURCE_FILTERS.find(({ types }) => types.includes(source.type));
  if (!filter) throw new Error(`No source group for ${source.type}`);
  // Remaining variants retain every identifying payload field, but never their mutable gates.
  const identity = Object.entries(source)
    .filter(
      ([key]) =>
        ![
          "availability",
          "visibility",
          "type",
          "cost",
          "unlockCondition",
          "trigger",
          "questType",
          "method",
        ].includes(key),
    )
    .map(([, value]) => {
      if (Array.isArray(value)) return value.join("-");
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });
  return [instance([source.type, ...identity].join("-"), filter.id)];
}

/** Project all placements before display filtering, so a hidden Later row cannot finish a source. */
export function projectSourceGroups<Row extends SourceGroupRow>(
  entries: readonly Row[],
  ctx: RowWindowContext,
  matchesSources: (sources: Source[]) => boolean = () => true,
): SourceSection<Row>[] {
  const sections = new Map<
    string,
    SourceInstance & { placements: Map<string, { entry: Row; sources: Source[] }> }
  >();
  for (const entry of entries) {
    const instances =
      entry.sources.length === 0
        ? [{ group: "progress" as const, id: "progress" }]
        : entry.sources.flatMap(sourceInstances);
    for (const instance of instances) {
      const section = sections.get(instance.id) ?? {
        ...instance,
        placements: new Map<string, { entry: Row; sources: Source[] }>(),
      };
      sections.set(instance.id, section);
      const placement = section.placements.get(entry.key) ?? { entry, sources: [] };
      section.placements.set(entry.key, placement);
      if (instance.source) placement.sources.push(instance.source);
    }
  }
  return [...sections.values()].flatMap(({ placements, ...instance }) => {
    const rows = [...placements.values()].map((placement) => ({
      ...placement,
      window: placement.entry.spoilered
        ? ("later" as const)
        : classifyItemAvailability(
            { sources: placement.sources, visibility: placement.entry.visibility },
            ctx,
          ),
    }));
    if (!matchesSources(rows.flatMap(({ sources }) => sources))) return [];
    const counted = rows.filter(({ entry }) => entry.obtainable);
    const remaining = counted.filter(({ entry }) => !entry.completed);
    let state: SourceSection<Row>["state"] = "later";
    if (remaining.length === 0) state = "done";
    else if (remaining.some(({ window }) => window !== "later")) state = "now";
    return [
      {
        ...instance,
        completed: counted.filter(({ entry }) => entry.completed).length,
        rows,
        spoilered:
          rows.length > 0 &&
          rows.every(
            ({ sources }) =>
              sources.length > 0 && sources.every((source) => !sourceVisible(source, ctx)),
          ),
        state,
        total: counted.length,
      },
    ];
  });
}

function sourceVisible(source: Source, ctx: RowWindowContext): boolean {
  if ("visibility" in source && !isConditionVisible(source.visibility, ctx.progressionState)) {
    return false;
  }
  if (
    "storeId" in source &&
    source.storeId &&
    !isConditionVisible(trackerData.stores[source.storeId]?.visibility, ctx.progressionState)
  ) {
    return false;
  }
  if (
    "villagerId" in source &&
    !isConditionVisible(trackerData.villagers[source.villagerId]?.visibility, ctx.progressionState)
  ) {
    return false;
  }
  if (source.type === "quest") {
    for (const [type, quests] of Object.entries(trackerData.quests)) {
      const quest = quests[source.questId];
      if (
        Object.hasOwn(quests, source.questId) &&
        (!isConditionVisible(quest.visibility, ctx.progressionState) ||
          !isConditionVisible(
            trackerData.categoryVisibility[type as keyof typeof trackerData.categoryVisibility],
            ctx.progressionState,
          ))
      ) {
        return false;
      }
    }
  }
  return true;
}
