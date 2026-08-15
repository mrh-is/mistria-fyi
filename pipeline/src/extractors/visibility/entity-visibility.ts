import { resolveToVisibility, simplifyCondition } from "./requirement-resolver.js";

import type {
  BiomeId,
  ItemId,
  NpcId,
  PerkId,
  QuestId,
  RecipeSource,
  Restriction,
  SkillId,
  Source,
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

interface RecipeSourceContext {
  biomeFloor: (biomeId: BiomeId) => number | undefined;
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
  assignItemVisibility(trackerData, storeVisibility);
  assignRecipeVisibility(trackerData, storeVisibility);
  assignPerkVisibility(trackerData);
  assignCosmeticVisibility(trackerData, storeVisibility);
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

function assignCosmeticVisibility(
  trackerData: TrackerData,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): void {
  for (const [cosmeticId, cosmetic] of Object.entries(trackerData.cosmetics)) {
    const sources = trackerData.sources[cosmeticId as unknown as ItemId];
    if (!sources || sources.length === 0) continue;

    const conditions = sources.map((source) => cosmeticSourceCondition(source, storeVisibility));
    cosmetic.visibility = orSimplify(conditions);
  }
}

function assignItemVisibility(
  trackerData: TrackerData,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): void {
  for (const [itemId, item] of Object.entries(trackerData.items)) {
    const sources = trackerData.sources[itemId as ItemId] ?? [];
    const conditions = sources.map((source) => itemSourceCondition(source, storeVisibility));
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

  const storyQuests = trackerData.quests.story_quests;
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

  const heartQuests = trackerData.quests.heart_quests;
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

  const fetchQuests = trackerData.quests.fetch_quests;
  if (fetchQuests) {
    const fetchVisibility = extractFetchQuestVisibility(chains.fetch, cutsceneMap);
    for (const [questId, quest] of Object.entries(fetchQuests)) {
      quest.visibility = fetchVisibility[questId as QuestId] ?? ALWAYS;
    }
  }

  assignOrderedChain(
    trackerData.quests.crown_quests,
    chains.crown,
    categoryVisibility.crown_quests,
  );
  assignOrderedChain(
    trackerData.quests.stillwell_challenges,
    chains.stillwell,
    categoryVisibility.stillwell_challenges,
  );
  assignOrderedChain(
    trackerData.quests.tali_challenges,
    chains.tali,
    categoryVisibility.tali_challenges,
  );
}

function assignRecipeVisibility(
  trackerData: TrackerData,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): void {
  const ctx: RecipeSourceContext = {
    biomeFloor: (biomeId) => trackerData.mines.biomes.find((b) => b.id === biomeId)?.startFloor,
    perks: trackerData.perks,
    perkTierLevels: trackerData.perkTierLevels,
    storeVisibility,
  };

  for (const recipe of Object.values(trackerData.recipes)) {
    const computed = recipe.sources.map((source) => ({
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
  source: RecipeSource,
  ctx: RecipeSourceContext,
): { entity: VisibilityCondition; source: VisibilityCondition } {
  switch (source.type) {
    case "beach_cave_chest":
    case "chicken_statue":
    case "dragon_forge":
    case "engagement":
    case "festival":
    case "letter":
    case "renown":
    case "treasure_chest":
    case "upgrade":
    case "wishing_well":
      // No dedicated gate data yet; entity and source share the same (currently always) condition.
      return { entity: ALWAYS, source: ALWAYS };
    case "default":
    case "museum_donation":
      return { entity: ALWAYS, source: ALWAYS };
    case "mines_chest":
    case "mines_dig_site": {
      const floor = ctx.biomeFloor(source.biomeId);
      const minesCondition: VisibilityCondition =
        floor === undefined ? ALWAYS : { floor, type: "minesLevel" };
      const perkCondition: VisibilityCondition = { perkId: source.perkId, type: "perkUnlocked" };
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
    case "store_with_perk": {
      const storeGate = storeGateCondition(source.storeId, ctx.storeVisibility);
      const stockGate = source.visibility ?? ALWAYS;
      const perkCondition: VisibilityCondition = { perkId: source.perkId, type: "perkUnlocked" };
      return {
        entity: andSimplify([storeGate, stockGate, perkCondition]),
        source: andSimplify([toAvailable(storeGate), toAvailable(stockGate), perkCondition]),
      };
    }
  }
}

function cosmeticSourceCondition(
  source: Source,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): VisibilityCondition {
  if (source.type === "store" && source.location) {
    return storeGateCondition(source.location as StoreId, storeVisibility);
  }
  if (source.type === "quest" && source.location) {
    return { questId: source.location as QuestId, type: "questCompleted" };
  }
  return ALWAYS;
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

function itemSourceCondition(
  source: Source,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): VisibilityCondition {
  const conditions: VisibilityCondition[] = [];

  if (source.type === "store" && source.location) {
    conditions.push(storeGateCondition(source.location as StoreId, storeVisibility));
  }

  for (const restriction of source.restrictions ?? []) {
    const restrictionCondition = restrictionToCondition(restriction, storeVisibility);
    if (restrictionCondition) conditions.push(restrictionCondition);
  }

  return andSimplify(conditions);
}

function orSimplify(conditions: VisibilityCondition[]): VisibilityCondition {
  if (conditions.length === 0) return ALWAYS;
  if (conditions.length === 1) return conditions[0];
  return simplifyCondition({
    conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    type: "or",
  });
}

function restrictionToCondition(
  restriction: Restriction,
  storeVisibility: Record<StoreId, VisibilityCondition>,
): undefined | VisibilityCondition {
  switch (restriction.type) {
    case "animal":
    case "cutscene":
    case "fishSize":
    case "randomStock":
    case "relationship":
    case "season":
    case "seenSeason":
    case "time":
    case "upperFloor":
    case "weather":
      // No visibility signal derivable from these restriction types.
      return undefined;
    case "building":
      return restriction.building
        ? storeGateCondition(restriction.building as StoreId, storeVisibility)
        : undefined;
    case "minesLevel":
      return restriction.level !== undefined
        ? { floor: restriction.level, type: "minesLevel" }
        : undefined;
    case "perk":
      return restriction.perk
        ? { perkId: restriction.perk as PerkId, type: "perkUnlocked" }
        : undefined;
    case "skill":
      return restriction.skill && restriction.level !== undefined
        ? { level: restriction.level, skillId: restriction.skill as SkillId, type: "skillLevel" }
        : undefined;
  }
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
