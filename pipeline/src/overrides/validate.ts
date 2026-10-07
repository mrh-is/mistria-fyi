import { forEachItem } from "../extractor-helpers.js";
import { getCutsceneRecords } from "../parse-fiddle.js";
import { entriesFromRecord, validateReviewedEntries } from "./entry.js";
import { cosmeticExclusions } from "./exclusions.js";
import {
  CROWN_QUEST_GATE,
  CUTSCENE_QUEST_ENTRIES,
  DRAGON_FORGE_RULE,
  EXCEPTIONS_ENTRIES,
  FESTIVAL_SEASON_MAP_ENTRIES,
  GOLDEN_PRODUCT_TO_ANIMAL_ENTRIES,
  HAYDENS_BARN_GATE,
  KNOWN_STORES_ENTRIES,
  MINE_SUBCAT_TO_BIOME_ENTRIES,
  PERK_BY_ITEM_ID_ENTRIES,
  PERK_BY_SUBCATEGORY_ENTRIES,
  SPELL_SOURCES_ENTRIES,
  STORE_UNLOCK_QUESTS_ENTRIES,
  STORY_PREREQUISITE_OVERRIDES_ENTRIES,
  UPGRADE_ACTIONS_ENTRIES,
  VILLAGER_GATES_ENTRIES,
} from "./game-facts.js";
import { SKILL_ENGLISH_NAMES } from "./ordinal-names.js";
import {
  COSMETIC_OVERRIDES,
  getItemOverrides,
  ITEM_SOURCE_REPLACEMENTS,
  reviewedSourceEntries,
} from "./sources.js";

import type { ParsedGameData } from "../parse-fiddle.js";
import type { ReviewedEntry } from "./entry.js";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function records(value: unknown): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(record(value)).map(([id, entry]) => [id, record(entry)]),
  );
}
function same(value: unknown, expected: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(expected);
}
function nativeGate(
  target: Record<string, unknown> | undefined,
  questId: string | undefined,
): boolean {
  return questId !== undefined && record(target?.requirements).completed_quest === questId;
}

const validate = <T>(
  label: string,
  entries: readonly ReviewedEntry<T>[],
  targets: ReadonlySet<string>,
  obsolete: (entry: ReviewedEntry<T>) => boolean = () => false,
): void => {
  validateReviewedEntries(label, entries, targets, obsolete);
};
const ids = (values: Record<string, unknown>): Set<string> => new Set(Object.keys(values));

/** Production preflight: validate the complete reviewed registry against unfiltered native tables. */
export function validateReviewedGameFacts(fiddle: ParsedGameData): void {
  const items: Record<string, Record<string, unknown>> = {};
  const subcategories = new Set<string>();
  forEachItem(fiddle, (id, item, _category, subcategory) => {
    items[id] = item;
    subcategories.add(subcategory);
  });
  const quests = Object.assign({}, ...Object.values(records(fiddle.quests))) as Record<
    string,
    unknown
  >;
  const stores = records(fiddle.stores);
  const villagers = records(fiddle.npcs);
  const spells = records(fiddle.spells);
  const perks = records(fiddle.perks);
  const assets = records(fiddle.player_assets);
  const cutscenes = getCutsceneRecords(fiddle);
  const questIds = ids(quests);
  validate(
    "cutscene quest",
    CUTSCENE_QUEST_ENTRIES,
    ids(cutscenes),
    (entry) => cutscenes[entry.id]?.quest_to_progress === entry.value.questId,
  );
  validate("store gate", STORE_UNLOCK_QUESTS_ENTRIES, ids(stores), (entry) =>
    nativeGate(stores[entry.id], entry.value),
  );
  validate(
    "villager gate",
    VILLAGER_GATES_ENTRIES,
    ids(villagers),
    (entry) =>
      entry.value?.type === "questCompleted" &&
      nativeGate(villagers[entry.id], entry.value.questId),
  );
  validate(
    "spell quest",
    SPELL_SOURCES_ENTRIES,
    ids(spells),
    (entry) => spells[entry.id]?.quest_to_unlock === entry.value,
  );
  validate("story prerequisite", STORY_PREREQUISITE_OVERRIDES_ENTRIES, questIds, (entry) => {
    const native = Object.values({ ...records(fiddle.letters), ...cutscenes }).filter(
      (source) =>
        source.quest_to_start === entry.id ||
        source.quest_to_progress === entry.id ||
        (Array.isArray(source.quest_to_start) && source.quest_to_start.includes(entry.id)),
    );
    return entry.value?.every((id) =>
      native.some((source) => record(source.requirements).completed_quest === id),
    );
  });
  validate(
    "store language",
    KNOWN_STORES_ENTRIES,
    ids(stores),
    (entry) =>
      stores[entry.id]?.article !== undefined &&
      same(stores[entry.id].article, entry.value.article),
  );
  validate(
    "store action",
    UPGRADE_ACTIONS_ENTRIES,
    ids(stores),
    (entry) => stores[entry.id]?.upgrade_action === entry.value,
  );
  validate(
    "mine category",
    MINE_SUBCAT_TO_BIOME_ENTRIES,
    subcategories,
    (entry) =>
      record(record(fiddle.items).mines)[entry.id] !== undefined &&
      record(record(record(fiddle.items).mines)[entry.id]).biome_id === entry.value,
  );
  validate(
    "golden animal product",
    GOLDEN_PRODUCT_TO_ANIMAL_ENTRIES,
    ids(items),
    (entry) => items[entry.id]?.animal_product === entry.value,
  );
  // Recipe obsolescence compares native collector snapshots in collectRecipeOnlySources.
  validate("recipe perk category", PERK_BY_SUBCATEGORY_ENTRIES, subcategories);
  validate("recipe perk item", PERK_BY_ITEM_ID_ENTRIES, ids(items));
  validate("recipe exception", EXCEPTIONS_ENTRIES, ids(items));
  validate(
    "festival season",
    FESTIVAL_SEASON_MAP_ENTRIES.filter((entry) => entry.id === "harvest"),
    ids(record(fiddle.festivals)),
    (entry) => record(record(fiddle.festivals).harvest).season === entry.value,
  );
  validate(
    "crown placeholder",
    [CROWN_QUEST_GATE],
    ids(record(fiddle.quests)),
    () => record(record(fiddle.quests).crown_quests).renown_level !== undefined,
  );
  validate("barn gate", [HAYDENS_BARN_GATE], questIds);
  validate(
    "dragon forge classification",
    [DRAGON_FORGE_RULE],
    new Set(
      Object.keys(items)
        .filter((id) => id.startsWith(DRAGON_FORGE_RULE.id))
        .map(() => DRAGON_FORGE_RULE.id),
    ),
    () =>
      Object.entries(items)
        .filter(([id]) => id.startsWith(DRAGON_FORGE_RULE.id))
        .every(([, item]) => item.production_method === DRAGON_FORGE_RULE.value),
  );
  validate(
    "skill name",
    entriesFromRecord(
      SKILL_ENGLISH_NAMES,
      "English ui/skill_menu source cache in game 1.0.5",
      "skills.toml lacks display names",
    ),
    ids(record(fiddle.skills)),
    (entry) => record(record(fiddle.skills)[entry.id]).name === entry.value,
  );
  for (const reference of [
    ...STORE_UNLOCK_QUESTS_ENTRIES,
    ...SPELL_SOURCES_ENTRIES,
    ...CUTSCENE_QUEST_ENTRIES.map((entry) => ({ ...entry, value: entry.value.questId })),
    ...STORY_PREREQUISITE_OVERRIDES_ENTRIES.flatMap((entry) =>
      (entry.value ?? []).map((value) => ({ ...entry, value })),
    ),
    ...VILLAGER_GATES_ENTRIES.flatMap((entry) =>
      entry.value?.type === "questCompleted" ? [{ ...entry, value: entry.value.questId }] : [],
    ),
  ]) {
    if (reference.value !== undefined && !questIds.has(reference.value)) {
      throw new Error(`Missing reviewed quest reference: ${reference.value}`);
    }
  }
  for (const reference of [...PERK_BY_ITEM_ID_ENTRIES, ...PERK_BY_SUBCATEGORY_ENTRIES]) {
    if (!Object.hasOwn(perks, reference.value)) {
      throw new Error(`Missing reviewed perk reference: ${reference.value}`);
    }
  }
  validate(
    "cosmetic exclusion",
    cosmeticExclusions(fiddle),
    ids(assets),
    (entry) =>
      assets[entry.id]?.default_unlocked === true ||
      (entry.id.startsWith("baby_back_") && assets[entry.id]?.name !== ""),
  );
  const misc = record(fiddle.misc);
  const price = record(misc.wishing_well).low_price;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new TypeError("Missing native wishing well low price");
  }
  validate("items", reviewedSourceEntries(getItemOverrides(price)), ids(items));
  validate("items", reviewedSourceEntries(ITEM_SOURCE_REPLACEMENTS), ids(items));
  validate("cosmetics", reviewedSourceEntries(COSMETIC_OVERRIDES), ids(assets));
}
