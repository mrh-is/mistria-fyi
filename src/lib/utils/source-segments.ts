import * as m from "$lib/paraglide/messages.js";

import { formatBiomeName, formatStoreName, withIndefiniteArticle } from "./format";

import type { AvailabilityCondition, ProductionMethod, Source } from "$lib/types/acquisition.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type {
  LocationId,
  MinesBiomeId,
  PerkId,
  QuestId,
  QuestType,
  Season,
  StoreId,
  TrackerData,
  VillagerId,
  WaterType,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { NameLookup, RecipeSourceLookups } from "./format";

export type SegmentLookups = Pick<TrackerData, "categoryVisibility"> &
  RecipeSourceLookups & {
    animalNames: NameLookup<TrackerData["animals"]>;
    /** Localized scroll bundle names, keyed by the English `bundleName` a source carries. */
    bundleNames: Partial<Record<string, string>>;
    entityVisibility?: VisibilityCondition;
    itemVisibility: VisibilityLookup<TrackerData["items"]>;
    /** The locale every message & name in these lookups renders in. */
    locale: LocaleCode;
    locationNames: Partial<Record<string, string>>;
    monsterNames: Partial<Record<string, string>>;
    museumWingNames: Partial<Record<string, string>>;
    questTypes: Partial<Record<QuestId, QuestType>>;
    questVillagerIds: Partial<Record<QuestId, VillagerId>>;
    /** The game's season names in the active locale (`ui` chunk). */
    seasonNames: Record<Season, string>;
    stationNames: Partial<Record<string, string>>;
    storeVisibility: VisibilityLookup<TrackerData["stores"]>;
    villagerNames: NameLookup<TrackerData["villagers"]>;
    villagerVisibility: VisibilityLookup<TrackerData["villagers"]>;
    waterNames: Partial<Record<string, string>>;
  };

export type SourceSegment =
  | string
  | {
      condition: VisibilityCondition;
      redacted?: [SourceSegment, ...SourceSegment[]];
      revealed: [SourceSegment, ...SourceSegment[]];
    }
  | { redacted: true };

type Segments = [SourceSegment, ...SourceSegment[]];
type Slot = SourceSegment | SourceSegment[];

/** A condition clause in both of the forms a store qualifier renders it in. */
interface StoreClause {
  /** Form inside an "after one of" list: "reaching Mines floor 20". */
  branch: string;
  /** Standalone form, appended after the store name: "after reaching Mines floor 20". */
  clause: string;
}

type VisibilityLookup<T> = Partial<Record<keyof T, VisibilityCondition>>;

const REDACTED: SourceSegment = { redacted: true };

const RECIPE_METHOD_MESSAGES: Record<
  ProductionMethod,
  (inputs: { recipe: string }, options: { locale: LocaleCode }) => string
> = {
  cook: m.source_recipe_cook,
  craft: m.source_recipe_craft,
  dragon_forge: m.source_recipe_dragon_forge,
  mill: m.source_recipe_mill,
  smith: m.source_recipe_smith,
};

/** Keyed by `upgradeName`, which the pipeline emits as either an id or an English label. */
const UPGRADE_MESSAGES: Partial<
  Record<string, (inputs: Record<string, never>, options: { locale: LocaleCode }) => string>
> = {
  adept_kitchen: m.source_upgrade_adept_kitchen,
  cozy_kitchen: m.source_upgrade_cozy_kitchen,
  farm_bridge: m.source_upgrade_farm_bridge,
  "House Stairs": m.source_upgrade_stairs,
  stairs: m.source_upgrade_stairs,
  "Starter Farm Bridge": m.source_upgrade_farm_bridge,
};

/** Keyed by the English `upgradeAction` the pipeline emits for a store; absent means upgrading. */
const STORE_ACTION_MESSAGES: Partial<
  Record<string, (inputs: Record<string, never>, options: { locale: LocaleCode }) => string>
> = {
  repairing: m.source_store_action_repairing,
};

const SLOT_MARKER = /(\d+)/;

export function buildBiomeLabel(biomeId: MinesBiomeId, lookups: SegmentLookups): Segments {
  const biome = lookups.biomes.find((b) => b.id === biomeId);
  if (!biome) return [titleCase(biomeId)];

  const { locale } = lookups;
  const condition: VisibilityCondition = { type: "minesLevel", floor: biome.floors.start };
  const start = String(biome.floors.start);
  const end = String(biome.floors.end);

  return [
    {
      condition,
      redacted: fillMessage((slot) =>
        m.source_biome_floors(
          { start: slot(REDACTED), end: slot(REDACTED), biome: slot(REDACTED) },
          { locale },
        ),
      ),
      revealed: [
        m.source_biome_floors(
          { start, end, biome: biomeDisplayName(biomeId, lookups) },
          { locale },
        ),
      ],
    },
  ];
}

export function buildPerkLabel(perkId: PerkId, lookups: SegmentLookups): Segments {
  const { locale } = lookups;
  const perk = lookups.perks[perkId];
  if (!perk) return [m.source_perk_label_unknown({ perk: titleCase(perkId) }, { locale })];

  const skill = lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId);
  const tier = String(perk.tier);
  const level = lookups.perkTierLevels[perk.tier - 1];
  const condition: VisibilityCondition = {
    type: "skillLevel",
    level,
    skillId: perk.skillId,
  };

  return [
    {
      condition,
      redacted: fillMessage((slot) =>
        m.source_perk_label({ perk: slot(REDACTED), skill, tier }, { locale }),
      ),
      revealed: [m.source_perk_label({ perk: perk.name, skill, tier }, { locale })],
    },
  ];
}

export function buildSourceSegments(source: Source, lookups: SegmentLookups): Segments {
  const { locale } = lookups;
  const opts = { locale };

  switch (source.type) {
    case "animal_product": {
      const animal = lookups.animalNames[source.animalId] ?? titleCase(source.animalId);
      return [m.source_animal_product({ animal }, opts)];
    }
    case "artifact_dig": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [
        locations
          ? m.source_artifact_dig({ locations }, opts)
          : m.source_artifact_dig_any({}, opts),
      ];
    }
    case "artifact_replicator": {
      const item = lookups.itemNames[source.originalItemId] ?? titleCase(source.originalItemId);
      return [m.source_artifact_replicator({ item }, opts)];
    }
    case "bait_fish":
      return [m.source_bait_fish({}, opts)];
    case "beach_cave_chest":
      return [m.source_beach_cave_chest({}, opts)];
    case "breed":
      return [m.source_breed({}, opts)];
    case "bug_catch": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [
        locations ? m.source_bug_catch({ locations }, opts) : m.source_bug_catch_any({}, opts),
      ];
    }
    case "chicken_statue":
      return "cost" in source
        ? [m.source_chicken_statue_cost({ cost: String(source.cost) }, opts)]
        : [m.source_chicken_statue_all_tiers({}, opts)];
    case "crop": {
      const seed = lookups.itemNames[source.seedItemId] ?? titleCase(source.seedItemId);
      return [m.source_crop({ seed }, opts)];
    }
    case "date":
      return [m.source_date({}, opts)];
    case "date_inspiration": {
      const item = lookups.itemNames[source.itemId] ?? titleCase(source.itemId);
      return [m.source_date_inspiration({ item }, opts)];
    }
    case "default":
      return [m.source_default({}, opts)];
    case "dive": {
      const waters = buildWaterList(source.waterTypes, lookups);
      return [waters ? m.source_dive({ waters }, opts) : m.source_dive_any({}, opts)];
    }
    case "donate_item":
    case "ship_item": {
      const message = source.type === "ship_item" ? m.source_ship_item : m.source_donate_item;
      const itemName = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
      const itemVis = lookups.itemVisibility[source.triggerItemId];
      const nameWithArticle = indefiniteName(itemName, locale);
      const itemSegment: SourceSegment =
        itemVis && itemVis.type !== "always"
          ? { condition: itemVis, revealed: [nameWithArticle] }
          : nameWithArticle;
      return fillMessage((slot) => message({ item: slot(itemSegment) }, opts));
    }
    case "engagement":
      return [m.source_engagement({}, opts)];
    case "equipment": {
      const item = lookups.itemNames[source.itemId] ?? titleCase(source.itemId);
      return [m.source_equipment({ item }, opts)];
    }
    case "festival": {
      const festival = lookups.festivals[source.festivalId]?.name ?? titleCase(source.festivalId);
      const festivalDate = lookups.festivals[source.festivalId]?.date;
      const date = festivalDate
        ? formatDateLabel(festivalDate.season, festivalDate.day, lookups.seasonNames, locale)
        : undefined;
      if (!source.storeId) {
        return [
          date
            ? m.source_festival_dated({ date, festival }, opts)
            : m.source_festival({ festival }, opts),
        ];
      }
      const store = storeDisplayName(source.storeId, lookups);
      return [
        date
          ? m.source_festival_store_dated({ date, festival, store }, opts)
          : m.source_festival_store({ festival, store }, opts),
      ];
    }
    case "festival_activity": {
      const festival = lookups.festivals[source.festivalId]?.name ?? titleCase(source.festivalId);
      return [m.source_festival_activity({ festival }, opts)];
    }
    case "fish": {
      const waters = buildWaterList(source.waterTypes, lookups);
      return [waters ? m.source_fish({ waters }, opts) : m.source_fish_any({}, opts)];
    }
    case "fish_trap":
      return [m.source_fish_trap({}, opts)];
    case "forage": {
      const locations = buildLocationList(source.locationIds, lookups);
      return [locations ? m.source_forage({ locations }, opts) : m.source_forage_any({}, opts)];
    }
    case "lost_and_found":
      return [m.source_lost_and_found({}, opts)];
    case "mine": {
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      return fillMessage((slot) => m.source_mine({ biome: slot(biomeLabel) }, opts));
    }
    case "mine_fish": {
      if (!source.biomeId) return [m.source_mine_fish_any({}, opts)];
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      return fillMessage((slot) => m.source_mine_fish({ biome: slot(biomeLabel) }, opts));
    }
    case "mines_chest": {
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      if (!source.perkId) {
        return fillMessage((slot) => m.source_mines_chest({ biome: slot(biomeLabel) }, opts));
      }
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return fillMessage((slot) =>
        m.source_mines_chest_perk({ biome: slot(biomeLabel), perk: slot(perkLabel) }, opts),
      );
    }
    case "mines_dig_site": {
      const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
      if (!source.perkId) {
        return fillMessage((slot) => m.source_mines_dig_site({ biome: slot(biomeLabel) }, opts));
      }
      const perk = plainPerkLabel(source.perkId, lookups);

      return [
        {
          condition: { type: "perkUnlocked", perkId: source.perkId },
          revealed: fillMessage((slot) =>
            m.source_mines_dig_site_perk({ biome: slot(biomeLabel), perk }, opts),
          ),
        },
      ];
    }
    case "monster":
      return [m.source_monster({ monster: monsterName(source.monsterId, lookups) }, opts)];
    case "monster_feed":
      return [m.source_monster_feed({ monster: monsterName(source.monsterId, lookups) }, opts)];
    case "museum_donation": {
      const wing = lookups.museumWingNames[source.wingId] ?? titleCase(source.wingId);
      return [m.source_museum_donation({ count: source.setCount, wing }, opts)];
    }
    case "perk": {
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return fillMessage((slot) => m.source_perk({ perk: slot(perkLabel) }, opts));
    }
    case "perk_drop": {
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return fillMessage((slot) => m.source_perk_drop({ perk: slot(perkLabel) }, opts));
    }
    case "proposal": {
      const villager = lookups.villagerNames[source.villagerId] ?? titleCase(source.villagerId);
      return [m.source_proposal({ villager }, opts)];
    }
    case "quest":
      return buildQuestSegments(source, lookups);
    case "reach_day": {
      const { day, season, year } = source.triggerDate;
      const date = year
        ? m.source_date_label_year(
            { day: String(day), season: lookups.seasonNames[season], year: String(year) },
            opts,
          )
        : formatDateLabel(season, day, lookups.seasonNames, locale);
      return [m.source_reach_day({ date }, opts)];
    }
    case "recipe": {
      const recipe = lookups.recipeNames[source.recipeId] ?? titleCase(source.recipeId);
      return [RECIPE_METHOD_MESSAGES[source.method]({ recipe }, opts)];
    }
    case "renown":
      return [m.source_renown({ level: String(source.level) }, opts)];
    case "ritual_chamber": {
      const perkLabel = buildPerkLabel(source.perkId, lookups);
      return fillMessage((slot) => m.source_ritual_chamber({ perk: slot(perkLabel) }, opts));
    }
    case "scroll_bundle": {
      const storeName = buildStoreName(source.storeId, lookups);
      const qualifier = buildStoreQualifier(source, lookups);
      const bundleName = lookups.bundleNames[source.bundleName] ?? source.bundleName;
      const bundleSegment: SourceSegment =
        lookups.entityVisibility && lookups.entityVisibility.type !== "always"
          ? { condition: lookups.entityVisibility, revealed: [bundleName] }
          : bundleName;
      return joinSegments(
        fillMessage((slot) =>
          m.source_scroll_bundle({ bundle: slot(bundleSegment), store: slot(storeName) }, opts),
        ),
        qualifier,
      );
    }
    case "spouseGift": {
      const villager = lookups.villagerNames[source.villagerId] ?? titleCase(source.villagerId);
      return [m.source_spouse_gift({ villager }, opts)];
    }
    case "station": {
      const station = lookups.stationNames[source.stationId] ?? titleCase(source.stationId);
      return [m.source_station({ station }, opts)];
    }
    case "store": {
      const storeName = buildStoreName(source.storeId, lookups);
      const qualifier = buildStoreQualifier(source, lookups);
      return joinSegments(
        fillMessage((slot) => m.source_store({ store: slot(storeName) }, opts)),
        qualifier,
      );
    }
    case "treasure_chest": {
      const tierData = lookups.treasureChestTiers[source.tier];
      const name = tierData?.name ?? `${titleCase(source.tier)} Treasure Box`;
      return [m.source_treasure_chest({ chest: indefiniteName(name, locale) }, opts)];
    }
    case "tree": {
      const sapling = lookups.itemNames[source.saplingItemId] ?? titleCase(source.saplingItemId);
      return [m.source_tree({ sapling }, opts)];
    }
    case "upgrade": {
      const message = UPGRADE_MESSAGES[source.upgradeName];
      return [
        message ? message({}, opts) : m.source_upgrade_other({ upgrade: source.upgradeName }, opts),
      ];
    }
    case "wedding":
      return [m.source_wedding({}, opts)];
    case "wishing_well":
      return [m.source_wishing_well({ cost: String(source.cost) }, opts)];
  }
}

export function buildStoreQualifier(
  source: Source & { type: "scroll_bundle" | "store"; storeId: StoreId },
  lookups: SegmentLookups,
): SourceSegment[] {
  const { locale } = lookups;
  const sourceVisibility = source.visibility;
  if (!sourceVisibility || sourceVisibility.type === "always") return [];

  const storeGate = lookups.storeVisibility[source.storeId];
  const hasStoreGate =
    storeGate !== undefined &&
    storeGate.type !== "always" &&
    visibilityContains(sourceVisibility, storeGate);
  const storeAction = hasStoreGate
    ? storeActionLabel(lookups.stores[source.storeId]?.upgradeAction, locale)
    : undefined;
  const storeQuestIds = storeGate ? collectQuestIds(storeGate) : new Set<QuestId>();
  const stockClauses = source.availability
    ? describeStoreAvailability(source.availability, lookups, storeQuestIds)
    : [];

  if (stockClauses === undefined && !storeAction) return [];

  const renderedClauses = stockClauses ?? [];
  if (!storeAction && renderedClauses.length === 0) return [];

  const revealed = [
    storeAction ? m.source_qualifier_after_action({ action: storeAction }, { locale }) : "",
    ...renderedClauses.map(({ clause }) => m.source_clause_append({ clause }, { locale })),
  ].join("");
  const redacted: SourceSegment[] = [];
  if (storeAction) {
    redacted.push(
      ...fillMessage((slot) =>
        m.source_qualifier_after_action({ action: slot(REDACTED) }, { locale }),
      ),
    );
  }
  for (const _clause of renderedClauses) {
    redacted.push(
      ...fillMessage((slot) => m.source_clause_append({ clause: slot(REDACTED) }, { locale })),
    );
  }

  return [
    {
      condition: sourceVisibility,
      redacted: joinSegments(redacted),
      revealed: [revealed],
    },
  ];
}

export function formatDateLabel(
  season: Season,
  day: number,
  seasonNames: SegmentLookups["seasonNames"],
  locale: LocaleCode,
): string {
  return m.source_date_label({ day: String(day), season: seasonNames[season] }, { locale });
}

/** The biome name with English's definite article ("the Tide Caverns"); other locales as-is. */
function biomeDisplayName(biomeId: MinesBiomeId, lookups: SegmentLookups): string {
  if (lookups.locale === "en") return formatBiomeName(biomeId, lookups.biomes);
  return lookups.biomes.find((b) => b.id === biomeId)?.name ?? titleCase(biomeId);
}

/** One "after one of" option: its first clause in branch form, any further ones appended. */
function branchLabel(clauses: StoreClause[], locale: LocaleCode): string {
  return clauses
    .map(({ branch, clause }, index) =>
      index === 0 ? branch : m.source_clause_append({ clause }, { locale }),
    )
    .join("");
}

function buildCookingChallengeSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const recipeName = source.challengeRecipeId
    ? (lookups.recipeNames[source.challengeRecipeId] ?? titleCase(source.challengeRecipeId))
    : (lookups.questNames[source.questId] ?? titleCase(source.questId));
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.cooking;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [recipeName] }
      : recipeName;

  const inner = fillMessage((slot) =>
    m.source_quest_cooking({ recipe: slot(nameSegment) }, { locale: lookups.locale }),
  );

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildCrownQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const subject = crownRequestSubject(questName);
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.crown;

  const subjectSegment: SourceSegment =
    questVis && questVis.type !== "always" ? { condition: questVis, revealed: [subject] } : subject;

  const inner = fillMessage((slot) =>
    m.source_quest_crown({ subject: slot(subjectSegment) }, { locale: lookups.locale }),
  );

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildFetchQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const villagerId = lookups.questVillagerIds[source.questId];
  const villagerName = villagerId
    ? (lookups.villagerNames[villagerId] ?? titleCase(villagerId))
    : "???";
  const villagerVis = villagerId ? lookups.villagerVisibility[villagerId] : undefined;
  const questVis = source.visibility;

  const villagerSegment: SourceSegment =
    villagerVis && villagerVis.type !== "always"
      ? { condition: villagerVis, revealed: [villagerName] }
      : villagerName;

  const itemId = source.requestedItemId;
  const itemName = itemId ? (lookups.itemNames[itemId] ?? titleCase(itemId)) : "???";
  const itemSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [itemName] }
      : itemName;

  return fillMessage((slot) =>
    m.source_quest_fetch(
      { item: slot(itemSegment), villager: slot(villagerSegment) },
      { locale: lookups.locale },
    ),
  );
}

function buildHeartQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;

  const villagerId = lookups.questVillagerIds[source.questId];
  const villagerName = villagerId
    ? (lookups.villagerNames[villagerId] ?? titleCase(villagerId))
    : "???";
  const villagerVis = villagerId ? lookups.villagerVisibility[villagerId] : undefined;

  const villagerSegment: SourceSegment =
    villagerVis && villagerVis.type !== "always"
      ? { condition: villagerVis, revealed: [villagerName] }
      : villagerName;
  const questSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  return fillMessage((slot) =>
    m.source_quest_heart(
      { quest: slot(questSegment), villager: slot(villagerSegment) },
      { locale: lookups.locale },
    ),
  );
}

function buildLocationList(locationIds: LocationId[] | undefined, lookups: SegmentLookups): string {
  return formatAlternatives(
    (locationIds ?? []).map((id) => lookups.locationNames[id] ?? titleCase(id)),
    lookups.locale,
  );
}

function buildMissionQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.mission;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  const inner = fillMessage((slot) =>
    m.source_quest_mission({ quest: slot(nameSegment) }, { locale: lookups.locale }),
  );

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}

function buildQuestSegments(source: Source & { type: "quest" }, lookups: SegmentLookups): Segments {
  const questType = source.questType ?? lookups.questTypes[source.questId];
  if (!questType) throw new Error(`Unknown quest type for ${source.questId}`);

  switch (questType) {
    case "cooking":
      return buildCookingChallengeSegments(source, lookups);
    case "crown":
      return buildCrownQuestSegments(source, lookups);
    case "fetch":
      return buildFetchQuestSegments(source, lookups);
    case "heart":
      return buildHeartQuestSegments(source, lookups);
    case "mission":
      return buildMissionQuestSegments(source, lookups);
    case "story":
      return buildStoryQuestSegments(source, lookups);
  }
}

function buildStoreName(storeId: StoreId, lookups: SegmentLookups): Segments {
  const vis = lookups.storeVisibility[storeId];
  const name = storeDisplayName(storeId, lookups);
  if (!vis || vis.type === "always") return [name];
  return [{ condition: vis, revealed: [name] }];
}

function buildStoryQuestSegments(
  source: Source & { type: "quest" },
  lookups: SegmentLookups,
): Segments {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId);
  const questVis = source.visibility;

  // The English message supplies "the", so drop the name's own to avoid "the The".
  const displayName =
    lookups.locale === "en" && questName.startsWith("The ") ? questName.slice(4) : questName;
  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [displayName] }
      : displayName;

  return fillMessage((slot) =>
    m.source_quest_story({ quest: slot(nameSegment) }, { locale: lookups.locale }),
  );
}

function buildWaterList(waterTypes: undefined | WaterType[], lookups: SegmentLookups): string {
  return formatAlternatives(
    (waterTypes ?? []).map((w) => lookups.waterNames[w] ?? titleCase(w)),
    lookups.locale,
  );
}

function collectQuestIds(condition: VisibilityCondition): Set<QuestId> {
  if (condition.type === "questAvailable" || condition.type === "questCompleted") {
    return new Set([condition.questId]);
  }
  if (condition.type === "and" || condition.type === "or") {
    return new Set(condition.conditions.flatMap((child) => [...collectQuestIds(child)]));
  }
  return new Set();
}

/**
 * The subject of a crown request's name, without the "Crown Request:" prefix every locale gives
 * it. Locales separate the prefix with a colon (`:` or `：`) or, in Japanese, a line break.
 */
function crownRequestSubject(questName: string): string {
  const subject = questName.replace(/^[^:：\n]*[:：\n]\s*/, "");
  if (subject !== questName) return subject;
  return questName.replace(/^Crown Request\s*/, "");
}

function describeStoreAvailability(
  condition: AvailabilityCondition,
  lookups: SegmentLookups,
  storeQuestIds: ReadonlySet<QuestId>,
): StoreClause[] | undefined {
  const opts = { locale: lookups.locale };
  const same = (text: string): StoreClause => ({ branch: text, clause: text });

  switch (condition.type) {
    case "all":
      return condition.conditions.flatMap(
        (child) => describeStoreAvailability(child, lookups, storeQuestIds) ?? [],
      );
    case "always":
    case "season":
    case "time":
    case "weather":
      return [];
    case "any": {
      const branches = condition.conditions.map((child) =>
        describeStoreAvailability(child, lookups, storeQuestIds),
      );
      if (branches.some((branch) => !branch || branch.length === 0)) return undefined;
      const options = formatAlternatives(
        branches.map((branch) => branchLabel(branch ?? [], lookups.locale)),
        lookups.locale,
      );
      return [same(m.source_clause_after_one_of({ options }, opts))];
    }
    case "gamePredicate":
    case "not":
      return undefined;
    case "hasUpperFloor":
      return [same(m.source_clause_upgraded_home({}, opts))];
    case "heartLevel": {
      const villager =
        lookups.villagerNames[condition.villagerId] ?? titleCase(condition.villagerId);
      const level = String(condition.level);
      return [
        {
          branch: m.source_branch_heart_level({ level, villager }, opts),
          clause: m.source_clause_heart_level({ level, villager }, opts),
        },
      ];
    }
    case "isDating":
      return [same(m.source_clause_dating({}, opts))];
    case "minesLevel": {
      const floor = String(condition.floor);
      return [
        {
          branch: m.source_branch_mines_floor({ floor }, opts),
          clause: m.source_clause_mines_floor({ floor }, opts),
        },
      ];
    }
    case "perkUnlocked": {
      const perk = plainPerkLabel(condition.perkId, lookups);
      return [{ branch: perk, clause: m.source_clause_perk({ perk }, opts) }];
    }
    case "quest": {
      if (storeQuestIds.has(condition.questId)) return [];
      if (condition.questId.startsWith("repair_")) {
        return [same(m.source_clause_repairing({}, opts))];
      }
      if (condition.questId.startsWith("upgrade_")) {
        return [same(m.source_clause_upgrading({}, opts))];
      }
      const quest = lookups.questNames[condition.questId] ?? titleCase(condition.questId);
      return condition.state === "completed"
        ? [
            {
              branch: m.source_branch_quest_completed({ quest }, opts),
              clause: m.source_clause_quest_completed({ quest }, opts),
            },
          ]
        : [
            {
              branch: m.source_branch_quest_available({ quest }, opts),
              clause: m.source_clause_quest_available({ quest }, opts),
            },
          ];
    }
    case "reachedSeason": {
      const season = lookups.seasonNames[condition.season];
      return [
        {
          branch: m.source_branch_season({ season }, opts),
          clause: m.source_clause_season({ season }, opts),
        },
      ];
    }
    case "skillLevel": {
      const skill = lookups.skillNames[condition.skillId] ?? titleCase(condition.skillId);
      const level = String(condition.level);
      return [
        {
          branch: m.source_branch_skill_level({ level, skill }, opts),
          clause: m.source_clause_skill_level({ level, skill }, opts),
        },
      ];
    }
  }
}

/**
 * Renders a localized message whose placeholders hold segments rather than plain text. `render`
 * receives a `slot` function that swaps a segment for a private-use marker; the rendered string is
 * split back apart at the markers, so each locale's word order decides where the segments land.
 */
function fillMessage(render: (slot: (value: Slot) => string) => string): Segments {
  const slots: Slot[] = [];
  const text = render((value) => {
    slots.push(value);
    return `${String(slots.length - 1)}`;
  });

  const used = new Set<number>();
  const parts = text.split(SLOT_MARKER).map((part, index) => {
    if (index % 2 === 0) return part;
    const slotIndex = Number(part);
    used.add(slotIndex);
    return slots[slotIndex] ?? [];
  });
  if (used.size !== slots.length) {
    throw new Error(`Message dropped a placeholder: ${JSON.stringify(text)}`);
  }

  return joinSegments(...parts.filter((part) => part !== ""));
}

/** Joins alternatives the way the locale writes "A, B, or C". */
function formatAlternatives(items: string[], locale: LocaleCode): string {
  return new Intl.ListFormat(locale, { type: "disjunction" }).format(items);
}

/** English prefixes "a"/"an"; other locales' messages handle articles themselves. */
function indefiniteName(name: string, locale: LocaleCode): string {
  return locale === "en" ? withIndefiniteArticle(name) : name;
}

function joinSegments(...parts: (SourceSegment | SourceSegment[])[]): Segments {
  const flat: SourceSegment[] = [];
  for (const part of parts) {
    if (Array.isArray(part)) {
      flat.push(...part);
    } else {
      flat.push(part);
    }
  }

  const merged: SourceSegment[] = [];
  for (const segment of flat) {
    const last = merged.at(-1);
    if (typeof segment === "string" && typeof last === "string") {
      merged[merged.length - 1] = last + segment;
    } else {
      merged.push(segment);
    }
  }

  if (merged.length === 0) throw new Error("joinSegments: no segments provided");
  return merged as Segments;
}

function monsterName(monsterId: string, lookups: SegmentLookups): string {
  if (monsterId === "any") return m.source_monster_any({}, { locale: lookups.locale });
  return lookups.monsterNames[monsterId] ?? titleCase(monsterId);
}

function plainPerkLabel(perkId: PerkId, lookups: SegmentLookups): string {
  const { locale } = lookups;
  const perk = lookups.perks[perkId];
  if (!perk) return m.source_perk_label_unknown({ perk: titleCase(perkId) }, { locale });
  const skill = lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId);
  return m.source_perk_label({ perk: perk.name, skill, tier: String(perk.tier) }, { locale });
}

function storeActionLabel(action: string | undefined, locale: LocaleCode): string {
  if (action === undefined) return m.source_store_action_upgrading({}, { locale });
  return STORE_ACTION_MESSAGES[action]?.({}, { locale }) ?? action;
}

/** The store name with English's definite article where the store takes one; others as-is. */
function storeDisplayName(storeId: StoreId, lookups: SegmentLookups): string {
  if (lookups.locale === "en") return formatStoreName(storeId, lookups.stores);
  return lookups.stores[storeId]?.name ?? titleCase(storeId);
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function visibilityContains(
  condition: VisibilityCondition,
  expected: VisibilityCondition,
): boolean {
  if (
    (condition.type === "questAvailable" || condition.type === "questCompleted") &&
    (expected.type === "questAvailable" || expected.type === "questCompleted")
  ) {
    return condition.questId === expected.questId;
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.some((child) => visibilityContains(child, expected));
  }
  return JSON.stringify(condition) === JSON.stringify(expected);
}
