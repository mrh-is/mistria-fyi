import type { Source } from "$lib/types/acquisition.js";
import type { AlmanacEntry, ItemId, TrackerData } from "$lib/types/tracker-data.js";

export interface TrackerIndex {
  almanacCanonicalIds: ItemId[];
  almanacDateCount: number;
  almanacEntries: AlmanacEntry[];
  almanacEntryByCanonicalId: ReadonlyMap<ItemId, AlmanacEntry>;
  categorySourceTypes: Readonly<Record<string, readonly SourceType[]>>;
  getAggregatedAlmanacSources: (canonicalId: ItemId) => Source[];
  memberToCanonicalAlmanacId: ReadonlyMap<ItemId, ItemId>;
  uniqueAlmanacCanonicalIds: ItemId[];
}

type SourceType = Source["type"];

export function buildTrackerIndex(trackerData: TrackerData): TrackerIndex {
  const almanacEntries = Object.values(trackerData.almanac).flatMap(({ items }) => items);
  const almanacEntryByCanonicalId = new Map<ItemId, AlmanacEntry>();
  const memberToCanonicalAlmanacId = new Map<ItemId, ItemId>();

  for (const entry of almanacEntries) {
    const canonicalId = entry.itemIds[0];
    almanacEntryByCanonicalId.set(canonicalId, entry);
    for (const memberId of entry.itemIds) {
      memberToCanonicalAlmanacId.set(memberId, canonicalId);
    }
  }

  const almanacCanonicalIds = almanacEntries.map((entry) => entry.itemIds[0]);
  const uniqueAlmanacCanonicalIds = [...new Set(almanacCanonicalIds)].toSorted();
  const aggregatedAlmanacSources = new Map<ItemId, Source[]>();

  function getAggregatedAlmanacSources(canonicalId: ItemId): Source[] {
    const resolvedCanonicalId = memberToCanonicalAlmanacId.get(canonicalId) ?? canonicalId;
    const cached = aggregatedAlmanacSources.get(resolvedCanonicalId);
    if (cached) return cached;

    const entry = almanacEntryByCanonicalId.get(resolvedCanonicalId);
    if (!entry || entry.itemIds.length <= 1) {
      const singleItemSources = trackerData.items[resolvedCanonicalId].sources;
      aggregatedAlmanacSources.set(resolvedCanonicalId, singleItemSources);
      return singleItemSources;
    }

    const seen = new Set<string>();
    const sources: Source[] = [];
    for (const itemId of entry.itemIds) {
      for (const source of trackerData.items[itemId].sources) {
        const key = JSON.stringify(source);
        if (!seen.has(key)) {
          seen.add(key);
          sources.push(source);
        }
      }
    }

    aggregatedAlmanacSources.set(resolvedCanonicalId, sources);
    return sources;
  }

  function uniqueSourceTypes(types: Iterable<SourceType>): readonly SourceType[] {
    return [...new Set(types)];
  }

  const categorySourceTypesWithoutAll = {
    almanac: uniqueSourceTypes(
      almanacEntries.flatMap((entry) =>
        entry.itemIds.flatMap((itemId) =>
          trackerData.items[itemId].sources.map(({ type }) => type),
        ),
      ),
    ),
    animals: uniqueSourceTypes([
      ...Object.values(trackerData.animals).flatMap((animal) => [
        ...animal.variantTiers.flatMap((tier) =>
          Object.values(tier).map(({ source }) => source.type),
        ),
        ...Object.values(animal.cosmetics).flatMap(({ sources }) =>
          sources.map(({ type }) => type),
        ),
      ]),
      ...Object.values(trackerData.pets.cosmetics).flatMap(({ sources }) =>
        sources.map(({ type }) => type),
      ),
      ...Object.values(trackerData.pets.skins).flatMap(({ sources }) =>
        sources.map(({ type }) => type),
      ),
    ]),
    cosmetics: uniqueSourceTypes(
      Object.values(trackerData.cosmetics).flatMap(({ sources }) =>
        sources.map(({ type }) => type),
      ),
    ),
    dates: uniqueSourceTypes(
      Object.values(trackerData.dates).flatMap(({ sources }) => sources.map(({ type }) => type)),
    ),
    mines: uniqueSourceTypes(
      Object.values(trackerData.mines.spells).flatMap(({ sources }) =>
        sources.map(({ type }) => type),
      ),
    ),
    museum: uniqueSourceTypes(
      Object.values(trackerData.museum).flatMap(({ sets }) =>
        Object.values(sets).flatMap(({ items }) =>
          items.flatMap((itemId) => trackerData.items[itemId].sources.map(({ type }) => type)),
        ),
      ),
    ),
    quests: uniqueSourceTypes(
      Object.entries(trackerData.quests).flatMap(([questType, quests]) =>
        Object.keys(quests).flatMap((questId) => {
          const typedQuestId = questId as keyof typeof quests;
          if (questType === "fetch") {
            const itemId = trackerData.quests.fetch[typedQuestId].itemId;
            return trackerData.items[itemId].sources.map(({ type }) => type);
          }
          if (questType === "cooking") {
            const quest = trackerData.quests.cooking[typedQuestId];
            if ("recipeId" in quest) {
              return trackerData.recipes[quest.recipeId].sources.map(({ type }) => type);
            }
          }
          return [];
        }),
      ),
    ),
    recipes: uniqueSourceTypes(
      Object.values(trackerData.recipes).flatMap(({ sources }) => sources.map(({ type }) => type)),
    ),
  } satisfies Readonly<Record<string, readonly SourceType[]>>;

  const categorySourceTypes = {
    ...categorySourceTypesWithoutAll,
    all: uniqueSourceTypes(Object.values(categorySourceTypesWithoutAll).flatMap((types) => types)),
  } satisfies Readonly<Record<string, readonly SourceType[]>>;

  return {
    almanacCanonicalIds,
    almanacDateCount: Object.keys(trackerData.dates).length,
    almanacEntries,
    almanacEntryByCanonicalId,
    categorySourceTypes,
    getAggregatedAlmanacSources,
    memberToCanonicalAlmanacId,
    uniqueAlmanacCanonicalIds,
  };
}
