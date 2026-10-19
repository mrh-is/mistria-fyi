import { mapNonEmpty } from "#lib/utils/record.js";

import { resolveToVisibility } from "../acquisition/requirement-projector.js";
import {
  CROWN_QUEST_GATE,
  HAYDENS_BARN_GATE,
  SPELL_SOURCES,
  STORE_UNLOCK_QUESTS,
  VILLAGER_GATES,
} from "../overrides/game-facts.js";
import { getCutsceneRecords } from "../parse/parse-fiddle.js";
import { availabilityToVisibility, toAvailableVisibility } from "./availability-projection.js";
import { ALWAYS_VISIBLE, simplifyCondition } from "./visibility-condition.js";

import type {
  MinesBiomeId,
  QuestId,
  SkillId,
  SourcedEntity,
  StoreId,
  TrackerData,
  VillagerId,
} from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { PipelineSource as AcquisitionSource } from "../acquisition/pipeline-source.js";
import type { CutsceneQuestMap } from "../extract/cutscene-quest-map.js";
import type { QuestChainData } from "../extract/quest-chains.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { RequirementExpression } from "../parse/requirements.js";

/**
 * Crown requests start once Town Rank reaches Iron Star (renown level 40). The game then waits a
 * few days before the first request and offers one per week; visibility ignores that cooldown.
 */
export const CROWN_QUEST_RENOWN_LEVEL = CROWN_QUEST_GATE.value;

/**
 * Hardcoded store → unlock-quest gates (see pipeline/README.md, reviewed game facts). Stores not listed here (including
 * Taliferro and Stillwell, who have no `stores.toml` entry of their own) are always visible.
 */

/** Hardcoded villager gates (see pipeline/README.md, reviewed game facts). Villagers not listed here are always visible. */

/**
 * The six barn animals gated behind Hayden's barn repair (see pipeline/README.md, reviewed game facts). Chicken and cow are
 * the only two starting animals and remain always-visible.
 */
const HAYDENS_BARN_UNLOCK_QUEST = HAYDENS_BARN_GATE.value;

interface FlatPerkInfo {
  skillId: SkillId;
  tier: number;
}

interface SourceVisibilityContext {
  biomeFloor: (biomeId: MinesBiomeId) => number | undefined;
  perks: Record<string, FlatPerkInfo>;
  perkTierLevels: TrackerData["perkTierLevels"];
  storeVisibility: Record<StoreId, VisibilityCondition>;
}

export function assignEntityVisibility(
  trackerData: TrackerData,
  cutsceneMap: CutsceneQuestMap,
  fiddle: ParsedGameData,
  questChains: QuestChainData,
): void {
  const ctx: SourceVisibilityContext = {
    biomeFloor: (biomeId) => trackerData.mines.biomes.find((b) => b.id === biomeId)?.floors.start,
    perks: buildFlatPerks(trackerData.skills),
    perkTierLevels: trackerData.perkTierLevels,
    storeVisibility: buildStoreVisibilityMap(trackerData.stores),
  };

  assignItemVisibility(trackerData, ctx);
  assignRecipeVisibility(trackerData, ctx);
  assignCosmeticVisibility(trackerData, ctx);
  assignMountVisibility(trackerData, ctx);
  assignAnimalVisibility(trackerData, fiddle);
  assignSpellVisibility(trackerData);
  assignQuestVisibility(trackerData, cutsceneMap, questChains);
  stripAllAlwaysVisibility(trackerData);
}

/** Hardcoded category visibility gates (see pipeline/README.md, reviewed game facts). */
export function extractCategoryVisibility(
  villagers: TrackerData["villagers"],
): Record<string, VisibilityCondition> {
  const dateableVillagerIds = Object.entries(villagers)
    .filter(([, villager]) => villager.dateable)
    .map(([id]) => id as VillagerId);

  const datesVisibility: VisibilityCondition =
    dateableVillagerIds.length > 0
      ? {
          type: "or",
          conditions: dateableVillagerIds.map((villagerId) => ({
            type: "heartLevel" as const,
            level: 8,
            villagerId,
          })) as [VisibilityCondition, ...VisibilityCondition[]],
        }
      : ALWAYS_VISIBLE;

  return {
    cooking: { type: "villagerKnown", villagerId: "taliferro" as VillagerId },
    crown: { type: "renownLevel", level: CROWN_QUEST_RENOWN_LEVEL },
    dates: datesVisibility,
    fetch: ALWAYS_VISIBLE,
    heart: ALWAYS_VISIBLE,
    mission: { type: "villagerKnown", villagerId: "stillwell" as VillagerId },
    story: ALWAYS_VISIBLE,
  };
}

/**
 * Resolves the request board's raw `RequirementExpression` fetch-quest requirements (
 * `questChains.fetch`, already extracted by the caller) into `VisibilityCondition`s via the requirement
 * resolver.
 */
export function extractFetchQuestVisibility(
  fetchRequirements: Record<QuestId, RequirementExpression>,
  cutsceneMap: CutsceneQuestMap,
): Record<QuestId, VisibilityCondition> {
  const result: Record<QuestId, VisibilityCondition> = {};
  for (const [questId, expression] of Object.entries(fetchRequirements)) {
    result[questId as QuestId] = simplifyCondition(resolveToVisibility(expression, cutsceneMap));
  }
  return result;
}

/**
 * Walks `cutscenes.toml` entries for `heart_level_changes` fields, grouping the resulting villager
 * heart-level bumps by the quest that triggers the cutscene (via the cutscene-quest map,
 * passed in by the caller rather than rebuilt here).
 */
export function extractHeartLevelChanges(
  fiddle: ParsedGameData,
  cutsceneMap: CutsceneQuestMap,
): Record<QuestId, { level: number; villagerId: VillagerId }[]> {
  const cutscenes = getCutsceneRecords(fiddle);
  const result: Record<QuestId, { level: number; villagerId: VillagerId }[]> = {};

  for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
    if (cutsceneId === "default") continue;
    const changes = cutscene.heart_level_changes;
    if (!Array.isArray(changes) || changes.length === 0) continue;

    const entry = cutsceneMap[cutsceneId];
    if (!entry) continue;

    const bumps: { level: number; villagerId: VillagerId }[] = [];
    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const obj = change as Record<string, unknown>;
      const villagerId = obj.npc_id;
      const level = obj.heart_level;
      if (typeof villagerId !== "string" || typeof level !== "number") continue;
      bumps.push({ level, villagerId: villagerId as VillagerId });
    }
    if (bumps.length === 0) continue;

    const existing = result[entry.questId] ?? [];
    result[entry.questId] = [...existing, ...bumps];
  }

  return result;
}

/**
 * Stamps hardcoded store visibility (see pipeline/README.md, reviewed game facts) directly onto trackerData.stores.
 * Taliferro and Stillwell have no store entry; their gates are handled by `stampVillagerVisibility`.
 */
export function stampStoreVisibility(trackerData: TrackerData): void {
  for (const [storeId, store] of Object.entries(trackerData.stores)) {
    const questId = STORE_UNLOCK_QUESTS[storeId];
    if (questId) {
      store.visibility = { type: "questCompleted", questId };
    }
  }
}

/** Stamps hardcoded villager visibility (see pipeline/README.md, reviewed game facts) directly onto trackerData.villagers. */
export function stampVillagerVisibility(trackerData: TrackerData): void {
  for (const [villagerId, villager] of Object.entries(trackerData.villagers)) {
    const gate = VILLAGER_GATES[villagerId];
    if (gate) {
      villager.visibility = gate;
    }
  }
}

function acquisitionSourceCondition(
  source: AcquisitionSource,
  ctx: SourceVisibilityContext,
): VisibilityCondition {
  switch (source.type) {
    case "animal_product":
    case "artifact_dig":
    case "artifact_replicator":
    case "breed":
    case "bug_catch":
    case "chicken_statue":
    case "crop":
    case "cutscene":
    case "date":
    case "date_inspiration":
    case "date_inspiration_drop":
    case "default":
    case "dive":
    case "donate_item":
    case "engagement":
    case "equipment":
    case "festival_activity":
    case "fish":
    case "fish_trap":
    case "forage":
    case "letter":
    case "lost_and_found":
    case "monster":
    case "monster_feed":
    case "museum_donation":
    case "proposal":
    case "reach_day":
    case "recipe":
    case "secret_chest":
    case "ship_item":
    case "spouseGift":
    case "station":
    case "treasure_chest":
    case "tree":
    case "wedding":
    case "wishing_well":
      return ALWAYS_VISIBLE;
    case "bait_fish":
      return { type: "questCompleted", questId: "apiaries_and_terrariums" as QuestId };
    case "horse_statue":
      return { type: "questAvailable", questId: source.questId };
    case "festival":
      return source.storeId
        ? storeGateCondition(source.storeId, ctx.storeVisibility)
        : ALWAYS_VISIBLE;
    case "mine":
    case "mine_fish": {
      const floor = source.biomeId ? ctx.biomeFloor(source.biomeId) : undefined;
      return floor === undefined ? ALWAYS_VISIBLE : { type: "mineFloor", floor };
    }
    case "mines_chest":
    case "mines_dig_site": {
      const floor = ctx.biomeFloor(source.biomeId);
      const minesCondition: VisibilityCondition =
        floor === undefined ? ALWAYS_VISIBLE : { type: "mineFloor", floor };
      const perkCondition: VisibilityCondition = source.perkId
        ? { type: "perkUnlocked", perkId: source.perkId }
        : ALWAYS_VISIBLE;
      return andSimplify([minesCondition, perkCondition]);
    }
    case "perk":
    case "perk_drop":
    case "ritual_chamber":
      return { type: "perkUnlocked", perkId: source.perkId };
    case "quest":
      return { type: "questCompleted", questId: source.questId };
    case "renown":
      return { type: "renownLevel", level: source.level };
    case "scroll_bundle":
      return storeGateCondition(source.storeId, ctx.storeVisibility);
    case "store":
    case "upgrade":
      return storeGateCondition(source.storeId, ctx.storeVisibility);
  }
}

function andSimplify(conditions: VisibilityCondition[]): VisibilityCondition {
  if (conditions.length === 0) return ALWAYS_VISIBLE;
  if (conditions.length === 1) return conditions[0];
  return simplifyCondition({
    type: "and",
    conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
  });
}

function assignAnimalVisibility(trackerData: TrackerData, fiddle: ParsedGameData): void {
  const ranching = fiddle.ranching as Record<string, unknown> | undefined;
  const animals = ranching?.animals as Record<string, Record<string, unknown>> | undefined;

  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const core = animals?.[animalId]?.core as Record<string, unknown> | undefined;
    const requirements = core?.requirements as Record<string, unknown> | undefined;
    const gated = requirements?.repaired_haydens_farm === true;
    animal.visibility = gated
      ? { type: "questCompleted", questId: HAYDENS_BARN_UNLOCK_QUEST }
      : ALWAYS_VISIBLE;
  }
}

function assignCosmeticVisibility(trackerData: TrackerData, ctx: SourceVisibilityContext): void {
  for (const [, cosmetic] of Object.entries(trackerData.cosmetics)) {
    assignSourcedEntityVisibility(cosmetic, ctx);
  }
}

function assignItemVisibility(trackerData: TrackerData, ctx: SourceVisibilityContext): void {
  for (const [, item] of Object.entries(trackerData.items)) {
    assignSourcedEntityVisibility(item, ctx);
  }
}

function assignMountVisibility(trackerData: TrackerData, ctx: SourceVisibilityContext): void {
  for (const appearance of Object.values(trackerData.mount.appearances)) {
    assignSourcedEntityVisibility(appearance, ctx);
  }
}

function assignOrderedChain(
  questGroup: Record<QuestId, { visibility?: VisibilityCondition }> | undefined,
  order: QuestId[],
  baseCondition: VisibilityCondition,
): void {
  if (!questGroup) return;
  for (let i = 0; i < order.length; i++) {
    const quest = questGroup[order[i]];
    if (!quest) continue;
    quest.visibility =
      i === 0
        ? baseCondition
        : andSimplify([baseCondition, { type: "questCompleted", questId: order[i - 1] }]);
  }
}

function assignQuestVisibility(
  trackerData: TrackerData,
  cutsceneMap: CutsceneQuestMap,
  chains: QuestChainData,
): void {
  const categoryVisibility = extractCategoryVisibility(trackerData.villagers);

  for (const [questId, quest] of Object.entries(trackerData.quests.story)) {
    const prerequisites = chains.story[questId as QuestId]?.prerequisites ?? [];
    quest.visibility =
      prerequisites.length === 0
        ? ALWAYS_VISIBLE
        : andSimplify(
            prerequisites.map((prereq): VisibilityCondition => ({
              type: "questCompleted",
              questId: prereq,
            })),
          );
  }

  for (const [villagerId, entries] of Object.entries(chains.heart)) {
    for (const entry of entries) {
      const quest = trackerData.quests.heart[entry.questId];
      if (!quest) continue;
      quest.heartLevel = entry.heartLevel;
      const conditions: VisibilityCondition[] = [
        { type: "villagerKnown", villagerId: villagerId as VillagerId },
        { type: "heartLevel", level: entry.heartLevel, villagerId: villagerId as VillagerId },
      ];
      if (entry.prerequisiteQuest) {
        conditions.push({ type: "questCompleted", questId: entry.prerequisiteQuest });
      }
      quest.visibility = andSimplify(conditions);
    }
  }

  const fetchVisibility = extractFetchQuestVisibility(chains.fetch, cutsceneMap);
  for (const [questId, quest] of Object.entries(trackerData.quests.fetch)) {
    quest.visibility = fetchVisibility[questId as QuestId] ?? ALWAYS_VISIBLE;
  }

  assignOrderedChain(trackerData.quests.crown, chains.crown, categoryVisibility.crown);
  assignOrderedChain(trackerData.quests.mission, chains.mission, categoryVisibility.mission);
  assignOrderedChain(trackerData.quests.cooking, chains.cooking, categoryVisibility.cooking);
}

function assignRecipeVisibility(trackerData: TrackerData, ctx: SourceVisibilityContext): void {
  for (const recipe of Object.values(trackerData.recipes)) {
    assignSourcedEntityVisibility(recipe, ctx);
  }
}

/**
 * Hardcoded spell → source-quest mappings. The cutscene chain (quest → seal break → post-cutscene
 * → spell_to_unlock) is too indirect for the cutsceneMap to trace automatically: the post-seal
 * cutscenes lack quest_to_start/quest_to_progress and aren't referenced in quest stage queries.
 * full_restore has no quest at all (mines level 10 reward).
 */

function acquisitionSourceConditions(
  source: AcquisitionSource,
  ctx: SourceVisibilityContext,
): { entity: VisibilityCondition; source: VisibilityCondition } {
  const entity = acquisitionSourceCondition(source, ctx);

  switch (source.type) {
    case "animal_product":
    case "artifact_dig":
    case "artifact_replicator":
    case "bait_fish":
    case "breed":
    case "bug_catch":
    case "chicken_statue":
    case "crop":
    case "cutscene":
    case "date":
    case "date_inspiration":
    case "date_inspiration_drop":
    case "default":
    case "dive":
    case "donate_item":
    case "engagement":
    case "equipment":
    case "festival":
    case "festival_activity":
    case "fish":
    case "fish_trap":
    case "forage":
    case "letter":
    case "lost_and_found":
    case "mine":
    case "mine_fish":
    case "monster":
    case "monster_feed":
    case "museum_donation":
    case "perk_drop":
    case "proposal":
    case "reach_day":
    case "recipe":
    case "renown":
    case "ritual_chamber":
    case "secret_chest":
    case "ship_item":
    case "spouseGift":
    case "station":
    case "treasure_chest":
    case "tree":
    case "upgrade":
    case "wedding":
    case "wishing_well":
      return { entity, source: ALWAYS_VISIBLE };
    case "mines_chest":
    case "mines_dig_site": {
      const floor = ctx.biomeFloor(source.biomeId);
      const minesCondition: VisibilityCondition =
        floor === undefined ? ALWAYS_VISIBLE : { type: "mineFloor", floor };
      return {
        entity,
        source: minesCondition,
      };
    }
    case "perk": {
      const perk = ctx.perks[source.perkId];
      const level = perk ? ctx.perkTierLevels[perk.tier - 1] : undefined;
      return {
        entity,
        source:
          perk && level !== undefined
            ? { type: "skillLevel", level, skillId: perk.skillId }
            : ALWAYS_VISIBLE,
      };
    }
    case "horse_statue":
    case "quest":
      return {
        entity,
        source: { type: "questAvailable", questId: source.questId },
      };

    case "scroll_bundle":
    case "store": {
      const storeGate = storeGateCondition(source.storeId, ctx.storeVisibility);
      const stockGate = source.stockGate ?? ALWAYS_VISIBLE;
      return {
        entity: andSimplify([entity, stockGate]),
        source: andSimplify([toAvailableVisibility(storeGate), toAvailableVisibility(stockGate)]),
      };
    }
  }
}

function assignSourcedEntityVisibility(entity: SourcedEntity, ctx: SourceVisibilityContext): void {
  const computed = mapNonEmpty(entity.sources, (source) => ({
    conditions: computeSourceConditions(source, ctx),
    source,
  }));

  entity.sources = mapNonEmpty(computed, ({ conditions, source }) => {
    const { stockGate: _stockGate, ...publicSource } = source as AcquisitionSource;
    return { ...publicSource, visibility: conditions.source };
  });
  entity.visibility = orSimplify(computed.map(({ conditions }) => conditions.entity));
}

function assignSpellVisibility(trackerData: TrackerData): void {
  for (const [spellId, spell] of Object.entries(trackerData.mines.spells)) {
    const questId = SPELL_SOURCES[spellId];
    if (questId) {
      spell.visibility = { type: "questCompleted", questId };
      spell.sources = [{ type: "quest", questId, questType: "story", trigger: "completion" }];
    }
  }
}

function buildFlatPerks(skills: TrackerData["skills"]): Record<string, FlatPerkInfo> {
  const result: Record<string, FlatPerkInfo> = {};
  for (const [skillId, skill] of Object.entries(skills)) {
    for (const [tierIdx, tier] of skill.perkTiers.entries()) {
      for (const perkId of Object.keys(tier)) {
        result[perkId] = { skillId: skillId as SkillId, tier: tierIdx + 1 };
      }
    }
  }
  return result;
}

function buildStoreVisibilityMap(
  stores: TrackerData["stores"],
): Record<StoreId, VisibilityCondition> {
  const result: Record<StoreId, VisibilityCondition> = {};
  for (const [storeId, store] of Object.entries(stores)) {
    if (store.visibility) {
      result[storeId as StoreId] = store.visibility;
    }
  }
  return result;
}

function computeSourceConditions(
  source: AcquisitionSource,
  ctx: SourceVisibilityContext,
): { entity: VisibilityCondition; source: VisibilityCondition } {
  const variant = acquisitionSourceConditions(source, ctx);
  const availabilityEntity = availabilityToVisibility(
    "availability" in source ? source.availability : undefined,
  );
  const availabilitySource = toAvailableVisibility(availabilityEntity);

  return {
    entity: andSimplify([variant.entity, availabilityEntity]),
    source: andSimplify([variant.source, availabilitySource]),
  };
}

function isAlwaysVisible(v: undefined | VisibilityCondition): boolean {
  return v === undefined || v.type === "always";
}

function orSimplify(conditions: VisibilityCondition[]): VisibilityCondition {
  if (conditions.length === 0) return ALWAYS_VISIBLE;
  if (conditions.length === 1) return conditions[0];
  return simplifyCondition({
    type: "or",
    conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
  });
}

function storeGateCondition(
  storeId: StoreId,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): VisibilityCondition {
  return storeVisibility[storeId] ?? ALWAYS_VISIBLE;
}

function stripAllAlwaysVisibility(trackerData: TrackerData): void {
  for (const item of Object.values(trackerData.items)) {
    if (isAlwaysVisible(item.visibility)) delete item.visibility;
  }
  for (const recipe of Object.values(trackerData.recipes)) {
    if (isAlwaysVisible(recipe.visibility)) delete recipe.visibility;
  }
  for (const cosmetic of Object.values(trackerData.cosmetics)) {
    if (isAlwaysVisible(cosmetic.visibility)) delete cosmetic.visibility;
  }
  for (const animal of Object.values(trackerData.animals)) {
    if (isAlwaysVisible(animal.visibility)) delete animal.visibility;
  }
  for (const spell of Object.values(trackerData.mines.spells)) {
    if (isAlwaysVisible(spell.visibility)) delete spell.visibility;
  }
  for (const questType of Object.values(trackerData.quests)) {
    for (const quest of Object.values(questType)) {
      if (isAlwaysVisible(quest.visibility)) delete quest.visibility;
    }
  }
  for (const villager of Object.values(trackerData.villagers)) {
    if (isAlwaysVisible(villager.visibility)) delete villager.visibility;
  }
  for (const store of Object.values(trackerData.stores)) {
    if (isAlwaysVisible(store.visibility)) delete store.visibility;
  }

  for (const entity of [
    ...Object.values(trackerData.items),
    ...Object.values(trackerData.recipes),
    ...Object.values(trackerData.cosmetics),
  ]) {
    for (const source of entity.sources ?? []) {
      if ("visibility" in source && isAlwaysVisible(source.visibility)) {
        delete source.visibility;
      }
    }
  }

  const filtered: Partial<Record<string, VisibilityCondition>> = {};
  for (const [key, vis] of Object.entries(trackerData.categoryVisibility)) {
    if (!isAlwaysVisible(vis)) filtered[key] = vis;
  }
  trackerData.categoryVisibility = filtered;
}
