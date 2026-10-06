import type { MinesBiomeId, QuestId, QuestType } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "./parse-fiddle.js";

/**
 * The six TOML quest-group keys tracked in the UI.
 * Request-board and registry siblings are intentionally excluded.
 */
export const TRACKED_QUEST_GROUPS = [
  "story_quests",
  "heart_quests",
  "fetch_quests",
  "crown_quests",
  "stillwell_challenges",
  "tali_challenges",
] as const;

export type TrackedQuestGroup = (typeof TRACKED_QUEST_GROUPS)[number];

export const QUEST_TYPE_MAP: Record<TrackedQuestGroup, QuestType> = {
  crown_quests: "crown",
  fetch_quests: "fetch",
  heart_quests: "heart",
  stillwell_challenges: "mission",
  story_quests: "story",
  tali_challenges: "cooking",
};

export function buildQuestTypeIndex(fiddle: ParsedGameData): Map<QuestId, QuestType> {
  const entries = new Map<QuestId, QuestType>();

  forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (nativeGroup, questId) => {
    const questType = QUEST_TYPE_MAP[nativeGroup as TrackedQuestGroup];
    const typedQuestId = questId as QuestId;
    const existing = entries.get(typedQuestId);
    if (existing && existing !== questType) {
      throw new Error(`Quest "${questId}" appears in both ${existing} and ${questType} groups`);
    }
    entries.set(typedQuestId, questType);
  });

  return new Map([...entries].toSorted(([left], [right]) => left.localeCompare(right)));
}

/**
 * Iterates every non-default, non-null, object item record in the full
 * `items[topCategory][subCategory][itemId]` hierarchy.
 *
 * Structural guards applied:
 * - absent `fiddle.items` root → no callbacks;
 * - `default` entries are skipped;
 * - null or non-object records are skipped.
 *
 * @param fiddle      Parsed game data.
 * @param onItem      Receives `itemId`, the item record, `topCategory`, and `subCategory`.
 */
export function forEachItem(
  fiddle: ParsedGameData,
  onItem: (
    itemId: string,
    item: Record<string, unknown>,
    topCategory: string,
    subCategory: string,
  ) => void,
): void {
  const items = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!items) return;

  for (const [topCat, subCategories] of Object.entries(items)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const [subCat, categoryItems] of Object.entries(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default" || typeof item !== "object" || item === null) continue;
        onItem(itemId, item, topCat, subCat);
      }
    }
  }
}

/**
 * Iterates every non-default, non-null, object quest record across the provided
 * quest-group keys.
 *
 * Structural guards applied:
 * - absent `fiddle.quests` root → no callbacks;
 * - missing or non-object group entries are skipped;
 * - `default` entries are skipped;
 * - null or non-object quest records are skipped.
 *
 * @param fiddle      Parsed game data.
 * @param questGroups Quest-group keys to iterate (e.g. a subset of TRACKED_QUEST_GROUPS).
 * @param onQuest     Receives `questType`, `questId`, and the quest record.
 */
export function forEachQuest(
  fiddle: ParsedGameData,
  questGroups: readonly string[],
  onQuest: (questType: string, questId: string, quest: Record<string, unknown>) => void,
): void {
  const quests = fiddle.quests as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;
  if (!quests) return;

  for (const questType of questGroups) {
    const questGroup = quests[questType];
    if (!questGroup || typeof questGroup !== "object") continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;
      onQuest(questType, questId, quest);
    }
  }
}

/**
 * Progress of a depth-first resolution keyed by name or path. An absent entry is unvisited;
 * reaching a `visiting` entry again means a dependency cycle.
 */
export type ResolutionState = "resolved" | "visiting";

/** Appends `value` to the list under `key`, creating the list on first use. */
export function appendToMultimap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) {
    values.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * The item ID the first `has_item` requirement in a quest’s stages names. `has_item` must be an
 * item ID, an `{ itemId = count }` table, or a non-empty array of such tables (whose first wins);
 * any other shape, including an empty table or array, throws rather than guessing.
 */
export function firstRequiredItemId(
  questId: string,
  quest: Record<string, unknown>,
): string | undefined {
  const stages = Array.isArray(quest.stages) ? (quest.stages as unknown[]) : [];
  for (const [index, stage] of stages.entries()) {
    if (typeof stage !== "object" || stage === null) continue;
    const requirements = (stage as Record<string, unknown>).requirements;
    if (typeof requirements !== "object" || requirements === null) continue;
    const hasItem = (requirements as Record<string, unknown>).has_item;
    if (hasItem === undefined) continue;
    return firstItemIdIn(hasItem, `quest "${questId}" stage ${index} has_item`);
  }
  return undefined;
}

/**
 * Iterates every stock entry of every non-default store category: `constant_stock`, then each
 * `seasonal` list (with its season key), then `random_stock`. Entries are passed through untouched;
 * they may be item-ID strings or tables.
 */
export function forEachStockEntry(
  fiddle: ParsedGameData,
  onEntry: (storeId: string, entry: unknown, season: string | undefined) => void,
): void {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return;

  for (const [storeId, store] of Object.entries(stores)) {
    if (storeId === "default" || typeof store !== "object" || store === null) continue;
    const categories = Array.isArray(store.categories) ? (store.categories as unknown[]) : [];

    for (const category of categories) {
      if (typeof category !== "object" || category === null) continue;
      const cat = category as Record<string, unknown>;

      if (Array.isArray(cat.constant_stock)) {
        for (const entry of cat.constant_stock as unknown[]) onEntry(storeId, entry, undefined);
      }
      const seasonal = cat.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const [season, entries] of Object.entries(seasonal)) {
          if (!Array.isArray(entries)) continue;
          for (const entry of entries as unknown[]) onEntry(storeId, entry, season);
        }
      }
      if (Array.isArray(cat.random_stock)) {
        for (const entry of cat.random_stock as unknown[]) onEntry(storeId, entry, undefined);
      }
    }
  }
}

/**
 * A Mines biome’s ID, derived from its English name ("The Tide Caverns" becomes `tide_caverns`).
 * The game data has no native biome key, so every caller must share this one derivation.
 */
export function minesBiomeId(name: string): MinesBiomeId {
  return name
    .replace(/^The\s+/i, "")
    .toLowerCase()
    .replaceAll(/\s+/g, "_") as MinesBiomeId;
}

/** The recipe a scroll entry teaches: `recipe_scroll`, falling back to `crafting_scroll`. */
export function scrollTargetOf(entry: Record<string, unknown>): string | undefined {
  return (
    (entry.recipe_scroll as string | undefined) ?? (entry.crafting_scroll as string | undefined)
  );
}

/** A snake_case id as English words ("fruit_tree" becomes "Fruit Tree"), for ids with no game name. */
export function titleCase(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Reads `string | table | table[]`, one level deep; any other shape is unexpected data. */
function firstItemIdIn(hasItem: unknown, context: string): string {
  if (typeof hasItem === "string" && hasItem.length > 0) return hasItem;
  if (isTable(hasItem)) return firstTableKey(hasItem, context);
  if (Array.isArray(hasItem)) {
    const entries = hasItem as unknown[];
    const first: unknown = entries[0];
    if (!isTable(first) || !entries.every((entry) => isTable(entry))) {
      throw new TypeError(`Expected ${context} to be a non-empty array of tables`);
    }
    for (const entry of entries) firstTableKey(entry, context);
    return firstTableKey(first, context);
  }
  throw new TypeError(`Expected ${context} to be an item ID, a table, or an array of tables`);
}

function firstTableKey(table: Record<string, unknown>, context: string): string {
  const [first] = Object.keys(table);
  if (first === undefined) throw new TypeError(`Expected ${context} to name an item`);
  return first;
}

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
