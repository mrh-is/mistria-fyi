import { resolveToVisibility, simplifyCondition } from "./requirement-resolver.js";

import type { Source as AcquisitionSource } from "$lib/types/acquisition.js";
import type {
  MinesBiomeId,
  NpcId,
  QuestId,
  QuestType,
  SpellId,
  StoreId,
  TrackerData,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { ParsedGameData } from "../../parse-fiddle.js";
import type { RequirementExpression } from "../../requirements.js";
import type { CutsceneQuestMap } from "./cutscene-quest-map.js";
import type { QuestChainData } from "./quest-chains.js";

const ALWAYS: VisibilityCondition = { type: "always" };

/**
 * The exact renown level required for crown quests to appear in-game has not been confirmed
 * against real playthrough data (spec Section 3j marks this TBD). 20 (Copper Star) is used as a
 * placeholder pending verification — crown quests are Town Rank milestones, and Copper Star is the
 * first rank past the tutorial ranks.
 */
export const CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER = 20;

/**
 * Hardcoded store → unlock-quest gates (spec Section 3d). Stores not listed here (including
 * Taliferro and Stillwell, who have no `stores.toml` entry of their own) are always visible.
 */
const STORE_UNLOCK_QUESTS: Partial<Record<string, QuestId>> = {
  darcy: "repair_the_bridge" as QuestId,
  louis: "repair_the_bridge" as QuestId,
  merri: "repair_the_bridge" as QuestId,
  vera: "repair_the_bridge" as QuestId,
  wheedle: "upgrade_the_saturday_market" as QuestId,
  zorel: "upgrade_the_saturday_market_plaza" as QuestId,
};

/** Hardcoded NPC gates (spec Section 3e). NPCs not listed here are always visible. */
const NPC_GATES: Partial<Record<string, VisibilityCondition>> = {
  caldarus: { questId: "breaking_the_fire_seal" as QuestId, type: "questCompleted" },
  darcy: { questId: "repair_the_bridge" as QuestId, type: "questCompleted" },
  louis: { questId: "repair_the_bridge" as QuestId, type: "questCompleted" },
  merri: { questId: "repair_the_bridge" as QuestId, type: "questCompleted" },
  seridia: { questId: "breaking_the_final_seal" as QuestId, type: "questCompleted" },
  stillwell: {
    questId: "upgrade_the_saturday_market_plaza" as QuestId,
    type: "questCompleted",
  },
  taliferro: { questId: "upgrade_the_saturday_market" as QuestId, type: "questCompleted" },
  vera: { questId: "repair_the_bridge" as QuestId, type: "questCompleted" },
  wheedle: { questId: "upgrade_the_saturday_market" as QuestId, type: "questCompleted" },
  zorel: {
    questId: "upgrade_the_saturday_market_plaza" as QuestId,
    type: "questCompleted",
  },
};

/**
 * The six barn animals gated behind Hayden's barn repair (spec Section 3i). Chicken and cow are
 * the only two starting animals and remain always-visible.
 */
const HAYDENS_BARN_UNLOCK_QUEST = "repair_haydens_barn" as QuestId;

interface SourceVisibilityContext {
  biomeFloor: (biomeId: MinesBiomeId) => number | undefined;
  perks: TrackerData["perks"];
  perkTierLevels: number[];
  storeVisibility: Record<StoreId, VisibilityCondition>;
}

/**
 * Mutates `trackerData` in place, stamping `visibility` on items, recipes (and their sources),
 * perks, cosmetics, animals, spells, and quests. Store visibility, the cutscene-quest map, and
 * quest chains are all precomputed by the caller (`main.ts`) and passed in here rather than
 * recomputed, since each is otherwise a pure function of `fiddle` that would be recomputed for no
 * reason.
 */
export function assignEntityVisibility(
  trackerData: TrackerData,
  storeVisibility: Record<StoreId, VisibilityCondition>,
  cutsceneMap: CutsceneQuestMap,
  fiddle: ParsedGameData,
  questChains: QuestChainData,
): void {
  const ctx: SourceVisibilityContext = {
    biomeFloor: (biomeId) => trackerData.mines.biomes.find((b) => b.id === biomeId)?.startFloor,
    perks: trackerData.perks,
    perkTierLevels: trackerData.perkTierLevels,
    storeVisibility,
  };

  assignItemVisibility(trackerData, ctx);
  assignRecipeVisibility(trackerData, ctx);
  assignPerkVisibility(trackerData);
  assignCosmeticVisibility(trackerData, ctx);
  assignAnimalVisibility(trackerData, fiddle);
  assignSpellVisibility(trackerData, fiddle, cutsceneMap);
  assignQuestVisibility(trackerData, cutsceneMap, questChains);
}

/** Hardcoded category visibility gates (spec Section 3j). */
export function extractCategoryVisibility(): Record<string, VisibilityCondition> {
  return {
    crown_quests: { level: CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER, type: "renownLevel" },
    fetch_quests: ALWAYS,
    heart_quests: ALWAYS,
    stillwell_challenges: { npcId: "stillwell" as NpcId, type: "npcKnown" },
    story_quests: ALWAYS,
    tali_challenges: { npcId: "taliferro" as NpcId, type: "npcKnown" },
  };
}

/**
 * Resolves the request board's raw `RequirementExpression` fetch-quest requirements (Task 3's
 * `questChains.fetch`, already extracted by the caller) into `VisibilityCondition`s via the Task 4
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
 * Walks `cutscenes.toml` entries for `heart_level_changes` fields, grouping the resulting NPC
 * heart-level bumps by the quest that triggers the cutscene (via the Task 2 cutscene-quest map,
 * passed in by the caller rather than rebuilt here).
 */
export function extractHeartLevelChanges(
  fiddle: ParsedGameData,
  cutsceneMap: CutsceneQuestMap,
): Record<QuestId, { level: number; npcId: NpcId }[]> {
  const cutscenes = getCutsceneRecords(fiddle);
  const result: Record<QuestId, { level: number; npcId: NpcId }[]> = {};

  for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
    if (cutsceneId === "default") continue;
    const changes = cutscene.heart_level_changes;
    if (!Array.isArray(changes) || changes.length === 0) continue;

    const entry = cutsceneMap[cutsceneId];
    if (!entry) continue;

    const bumps: { level: number; npcId: NpcId }[] = [];
    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const obj = change as Record<string, unknown>;
      const npcId = obj.npc_id;
      const level = obj.heart_level;
      if (typeof npcId !== "string" || typeof level !== "number") continue;
      bumps.push({ level, npcId: npcId as NpcId });
    }
    if (bumps.length === 0) continue;

    const existing = result[entry.questId] ?? [];
    result[entry.questId] = [...existing, ...bumps];
  }

  return result;
}

/** Hardcoded NPC visibility (spec Section 3e). NPCs absent from the map are always visible. */
export function extractNpcVisibility(): Record<NpcId, VisibilityCondition> {
  const result: Record<NpcId, VisibilityCondition> = {};
  for (const [npcId, condition] of Object.entries(NPC_GATES)) {
    if (condition) result[npcId as NpcId] = condition;
  }
  return result;
}

/**
 * Hardcoded store visibility (spec Section 3d), keyed by the store IDs actually present in
 * `fiddle.stores` — Taliferro and Stillwell have no store entry of their own and are handled by
 * `extractNpcVisibility` instead.
 */
export function extractStoreVisibility(
  fiddle: ParsedGameData,
): Record<StoreId, VisibilityCondition> {
  const stores = fiddle.stores as Record<string, unknown> | undefined;
  const result: Record<StoreId, VisibilityCondition> = {};
  if (!stores) return result;

  for (const storeId of Object.keys(stores)) {
    if (storeId === "default") continue;
    const questId = STORE_UNLOCK_QUESTS[storeId];
    result[storeId as StoreId] = questId ? { questId, type: "questCompleted" } : ALWAYS;
  }
  return result;
}

function acquisitionSourceCondition(
  source: AcquisitionSource,
  ctx: SourceVisibilityContext,
): VisibilityCondition {
  switch (source.type) {
    case "animal_product":
    case "artifact_dig":
    case "artifact_replicator":
    case "beach_cave_chest":
    case "breed":
    case "bug_catch":
    case "chicken_statue":
    case "crop":
    case "date":
    case "default":
    case "dive":
    case "engagement":
    case "equipment":
    case "festival_activity":
    case "fish":
    case "fish_trap":
    case "forage":
    case "letter":
    case "monster":
    case "monster_feed":
    case "museum_donation":
    case "proposal":
    case "recipe":
    case "station":
    case "treasure_chest":
    case "tree":
    case "wedding":
    case "wishing_well":
      return ALWAYS;
    case "festival":
      return source.storeId ? storeGateCondition(source.storeId, ctx.storeVisibility) : ALWAYS;
    case "mine": {
      const floor = source.biomeId ? ctx.biomeFloor(source.biomeId) : undefined;
      return floor !== undefined ? { floor, type: "minesLevel" } : ALWAYS;
    }
    case "mines_chest":
    case "mines_dig_site": {
      const floor = ctx.biomeFloor(source.biomeId);
      const minesCondition: VisibilityCondition =
        floor === undefined ? ALWAYS : { floor, type: "minesLevel" };
      const perkCondition: VisibilityCondition = source.perkId
        ? { perkId: source.perkId, type: "perkUnlocked" }
        : ALWAYS;
      return andSimplify([minesCondition, perkCondition]);
    }
    case "perk":
    case "perk_drop":
    case "ritual_chamber":
      return { perkId: source.perkId, type: "perkUnlocked" };
    case "quest":
      return { questId: source.questId, type: "questCompleted" };
    case "renown":
      return { level: source.level, type: "renownLevel" };
    case "scroll_bundle":
      return storeGateCondition(source.storeId, ctx.storeVisibility);
    case "store":
    case "upgrade":
      return storeGateCondition(source.storeId, ctx.storeVisibility);
  }
}

function andSimplify(conditions: VisibilityCondition[]): VisibilityCondition {
  if (conditions.length === 0) return ALWAYS;
  if (conditions.length === 1) return conditions[0];
  return simplifyCondition({
    conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    type: "and",
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
      ? { questId: HAYDENS_BARN_UNLOCK_QUEST, type: "questCompleted" }
      : ALWAYS;
  }
}

function assignCosmeticVisibility(trackerData: TrackerData, ctx: SourceVisibilityContext): void {
  for (const [, cosmetic] of Object.entries(trackerData.cosmetics)) {
    const sources = cosmetic.sources;
    if (!sources || sources.length === 0) continue;

    const conditions = sources.map((source) => acquisitionSourceCondition(source, ctx));
    cosmetic.visibility = orSimplify(conditions);
  }
}

function assignItemVisibility(trackerData: TrackerData, ctx: SourceVisibilityContext): void {
  for (const [, item] of Object.entries(trackerData.items)) {
    const sources = item.sources ?? [];
    const conditions = sources.map((source) => acquisitionSourceCondition(source, ctx));
    item.visibility = orSimplify(conditions);
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
        : andSimplify([baseCondition, { questId: order[i - 1], type: "questCompleted" }]);
  }
}

function assignPerkVisibility(trackerData: TrackerData): void {
  for (const perk of Object.values(trackerData.perks)) {
    const level = trackerData.perkTierLevels[perk.tier - 1];
    perk.visibility =
      level === undefined ? ALWAYS : { level, skillId: perk.skillId, type: "skillLevel" };
  }
}

function assignQuestVisibility(
  trackerData: TrackerData,
  cutsceneMap: CutsceneQuestMap,
  chains: QuestChainData,
): void {
  const categoryVisibility = extractCategoryVisibility();

  const storyQuests = trackerData.quests["story_quests" as QuestType];
  if (storyQuests) {
    for (const [questId, quest] of Object.entries(storyQuests)) {
      const prerequisites = chains.story[questId as QuestId]?.prerequisites ?? [];
      quest.visibility =
        prerequisites.length === 0
          ? ALWAYS
          : andSimplify(
              prerequisites.map((prereq): VisibilityCondition => ({
                questId: prereq,
                type: "questCompleted",
              })),
            );
    }
  }

  const heartQuests = trackerData.quests["heart_quests" as QuestType];
  if (heartQuests) {
    for (const [npcId, entries] of Object.entries(chains.heart)) {
      for (const entry of entries) {
        const quest = heartQuests[entry.questId];
        if (!quest) continue;
        const conditions: VisibilityCondition[] = [
          { npcId: npcId as NpcId, type: "npcKnown" },
          { level: entry.heartLevel, npcId: npcId as NpcId, type: "heartLevel" },
        ];
        if (entry.prerequisiteQuest) {
          conditions.push({ questId: entry.prerequisiteQuest, type: "questCompleted" });
        }
        quest.visibility = andSimplify(conditions);
      }
    }
  }

  const fetchQuests = trackerData.quests["fetch_quests" as QuestType];
  if (fetchQuests) {
    const fetchVisibility = extractFetchQuestVisibility(chains.fetch, cutsceneMap);
    for (const [questId, quest] of Object.entries(fetchQuests)) {
      quest.visibility = fetchVisibility[questId as QuestId] ?? ALWAYS;
    }
  }

  assignOrderedChain(
    trackerData.quests["crown_quests" as QuestType],
    chains.crown,
    categoryVisibility.crown_quests,
  );
  assignOrderedChain(
    trackerData.quests["stillwell_challenges" as QuestType],
    chains.stillwell,
    categoryVisibility.stillwell_challenges,
  );
  assignOrderedChain(
    trackerData.quests["tali_challenges" as QuestType],
    chains.tali,
    categoryVisibility.tali_challenges,
  );
}

function assignRecipeVisibility(trackerData: TrackerData, ctx: SourceVisibilityContext): void {
  for (const recipe of Object.values(trackerData.recipes)) {
    const recipeSources = recipe.sources ?? [];
    const computed = recipeSources.map((source) => ({
      conditions: computeRecipeSourceConditions(source, ctx),
      source,
    }));

    recipe.sources = computed.map(({ conditions, source }) => ({
      ...source,
      visibility: conditions.source,
    }));

    recipe.visibility = orSimplify(computed.map(({ conditions }) => conditions.entity));
  }
}

function assignSpellVisibility(
  trackerData: TrackerData,
  fiddle: ParsedGameData,
  cutsceneMap: CutsceneQuestMap,
): void {
  const cutscenes = getCutsceneRecords(fiddle);

  for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
    if (cutsceneId === "default") continue;
    const spellId = cutscene.spell_to_unlock;
    if (typeof spellId !== "string" || spellId === "<n/a>") continue;

    const spell = trackerData.mines.spells[spellId as SpellId];
    if (!spell) continue;

    const entry = cutsceneMap[cutsceneId];
    spell.visibility = entry
      ? {
          questId: entry.questId,
          type: entry.phase === "completed" ? "questCompleted" : "questAvailable",
        }
      : ALWAYS;
  }
}

function computeRecipeSourceConditions(
  source: AcquisitionSource,
  ctx: SourceVisibilityContext,
): { entity: VisibilityCondition; source: VisibilityCondition } {
  switch (source.type) {
    case "animal_product":
    case "artifact_dig":
    case "artifact_replicator":
    case "beach_cave_chest":
    case "breed":
    case "bug_catch":
    case "chicken_statue":
    case "crop":
    case "date":
    case "default":
    case "dive":
    case "engagement":
    case "equipment":
    case "festival":
    case "festival_activity":
    case "fish":
    case "fish_trap":
    case "forage":
    case "letter":
    case "mine":
    case "monster":
    case "monster_feed":
    case "museum_donation":
    case "perk_drop":
    case "proposal":
    case "recipe":
    case "renown":
    case "ritual_chamber":
    case "station":
    case "treasure_chest":
    case "tree":
    case "upgrade":
    case "wedding":
    case "wishing_well":
      // No dedicated gate data yet; entity and source share the same (currently always) condition.
      return { entity: ALWAYS, source: ALWAYS };
    case "mines_chest":
    case "mines_dig_site": {
      const floor = ctx.biomeFloor(source.biomeId);
      const minesCondition: VisibilityCondition =
        floor === undefined ? ALWAYS : { floor, type: "minesLevel" };
      const perkCondition: VisibilityCondition = source.perkId
        ? { perkId: source.perkId, type: "perkUnlocked" }
        : ALWAYS;
      return {
        entity: andSimplify([minesCondition, perkCondition]),
        source: minesCondition,
      };
    }
    case "perk": {
      const perk = ctx.perks[source.perkId];
      const level = perk ? ctx.perkTierLevels[perk.tier - 1] : undefined;
      return {
        entity: { perkId: source.perkId, type: "perkUnlocked" },
        source:
          perk && level !== undefined
            ? { level, skillId: perk.skillId, type: "skillLevel" }
            : ALWAYS,
      };
    }
    case "quest": {
      return {
        entity: { questId: source.questId, type: "questCompleted" },
        source: { questId: source.questId, type: "questAvailable" },
      };
    }
    case "scroll_bundle":
    case "store": {
      const storeGate = storeGateCondition(source.storeId, ctx.storeVisibility);
      // At this point source.visibility carries the extraction-time stock entity gate.
      const stockGate = source.visibility ?? ALWAYS;
      return {
        entity: andSimplify([storeGate, stockGate]),
        source: andSimplify([toAvailable(storeGate), toAvailable(stockGate)]),
      };
    }
  }
}

/**
 * Returns cutscene records from either the nested (`fiddle.cutscenes.cutscenes`) or flat
 * (`fiddle.cutscenes`) structure, matching the access pattern in `cutscene-quest-map.ts`.
 */
function getCutsceneRecords(fiddle: ParsedGameData): Record<string, Record<string, unknown>> {
  const raw = fiddle.cutscenes as Record<string, unknown> | undefined;
  const nested = raw?.cutscenes as Record<string, Record<string, unknown>> | undefined;
  return nested ?? (raw as Record<string, Record<string, unknown>> | undefined) ?? {};
}

function orSimplify(conditions: VisibilityCondition[]): VisibilityCondition {
  if (conditions.length === 0) return ALWAYS;
  if (conditions.length === 1) return conditions[0];
  return simplifyCondition({
    conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    type: "or",
  });
}

function storeGateCondition(
  storeId: StoreId,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): VisibilityCondition {
  return storeVisibility[storeId] ?? ALWAYS;
}

function toAvailable(condition: VisibilityCondition): VisibilityCondition {
  switch (condition.type) {
    case "always":
    case "heartLevel":
    case "married":
    case "minesLevel":
    case "npcKnown":
    case "perkUnlocked":
    case "questAvailable":
    case "renownLevel":
    case "skillLevel":
      return condition;
    case "and":
    case "or":
      return simplifyCondition({
        conditions: condition.conditions.map(toAvailable) as [
          VisibilityCondition,
          ...VisibilityCondition[],
        ],
        type: condition.type,
      });
    case "questCompleted":
      return { questId: condition.questId, type: "questAvailable" };
  }
}
