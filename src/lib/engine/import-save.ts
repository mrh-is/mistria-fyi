import { trackerData } from "$lib/data/index.js";
import { recordKeys, recordValues } from "$lib/utils.js";

import type { CompletedState, MergeCounts, QuestState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  ItemId,
  PerkId,
  RecipeId,
  SpellId,
} from "$lib/types/tracker-data.js";

// ─── Import result ──────────────────────────────────────────────────

export interface ImportResult {
  /** Per-category counts of items imported */
  counts: MergeCounts;
  /** Human-readable warnings (e.g. unknown IDs) */
  warnings: string[];
}

// ─── Save file shapes ───────────────────────────────────────────────

/** All parsed save files bundled together */
export interface SaveBundle {
  gamedata?: GamedataSave;
  player?: PlayerSave;
  quests?: QuestsSave;
}

interface GamedataSave {
  maximum_mines_level?: number;
  museum_progress?: string[];
  t2_world_facts?: Record<string, unknown>;
}

interface PlayerSave {
  animal_cosmetic_unlocks?: Record<string, string[]>;
  animal_variant_unlocks?: Record<string, string[]>;
  cosmetic_unlocks?: string[];
  items_acquired?: string[];
  items_sold?: Record<string, unknown>;
  perks?: string[];
  recipe_unlocks?: string[];
  recipes_created?: string[];
  skill_xp?: Record<string, number>;
  spells_learned?: string[];
}

interface QuestsSave {
  active_quests?: { quest_name?: string }[];
  completed_quests?: string[];
}

export function buildImportState(bundle: SaveBundle): {
  completed: Partial<CompletedState>;
  result: ImportResult;
} {
  const warnings: string[] = [];
  const counts: MergeCounts = {
    almanac: 0,
    almanacRecipes: 0,
    animalCosmetics: 0,
    animals: 0,
    cosmetics: 0,
    mineFloor: 0,
    museum: 0,
    npcLevels: 0,
    perks: 0,
    quests: 0,
    renown: 0,
    skillLevels: 0,
    spells: 0,
  };

  const save = bundle.player;

  // ── Almanac: union of items_acquired + items_sold keys + recipes_created ──
  const almanacIds = new Set<ItemId>();
  const validItems = new Set(Object.keys(trackerData.items));

  const allPlayerItems = new Set<string>([
    ...(save?.items_acquired ?? []),
    ...Object.keys(save?.items_sold ?? {}),
    ...(save?.recipes_created ?? []),
  ]);

  for (const id of allPlayerItems) {
    if (validItems.has(id)) {
      almanacIds.add(id as ItemId);
    }
  }
  counts.almanac = almanacIds.size;

  // ── Recipe unlocks ──
  const almanacRecipes = new Set<RecipeId>();
  const validRecipes = new Set(Object.keys(trackerData.recipes));

  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    if (recipe.sources.some((source) => source.type === "default")) {
      almanacRecipes.add(id as RecipeId);
    }
  }

  for (const id of save?.recipe_unlocks ?? []) {
    if (validRecipes.has(id)) {
      almanacRecipes.add(id as RecipeId);
    } else if (validItems.has(id)) {
      const recipeId = trackerData.items[id as ItemId].sources.find(
        (source) => source.type === "recipe",
      )?.recipeId;
      if (recipeId) {
        almanacRecipes.add(recipeId);
      }
    }
  }
  counts.almanacRecipes = almanacRecipes.size;

  // ── Cosmetics ──
  const cosmeticIds = new Set<CosmeticId>();
  const validCosmetics = new Set(Object.keys(trackerData.cosmetics));

  for (const id of save?.cosmetic_unlocks ?? []) {
    if (validCosmetics.has(id)) {
      cosmeticIds.add(id as CosmeticId);
    } else {
      warnings.push(`Unknown cosmetic: ${id}`);
    }
  }
  counts.cosmetics = cosmeticIds.size;

  // ── Animal variants ──
  const animalVariants: Record<string, Set<AnimalVariantId>> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const validVariants = new Set(animal.variantTiers.flatMap((tier) => Object.keys(tier)));
    const playerVariants = save?.animal_variant_unlocks?.[animalId] ?? [];
    const matched = new Set<AnimalVariantId>();

    for (const v of playerVariants) {
      if (validVariants.has(v)) {
        matched.add(v as AnimalVariantId);
      } else {
        warnings.push(`Unknown ${animalId} variant: ${v}`);
      }
    }
    animalVariants[animalId] = matched;
    counts.animals += matched.size;
  }

  // ── Animal cosmetics ──
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const validAnimalCosmetics = new Set(Object.keys(animal.cosmetics));
    const playerCosmetics = save?.animal_cosmetic_unlocks?.[animalId] ?? [];
    const matched = new Set<CosmeticId>();

    for (const c of playerCosmetics) {
      if (validAnimalCosmetics.has(c)) {
        matched.add(c as CosmeticId);
      } else {
        warnings.push(`Unknown ${animalId} cosmetic: ${c}`);
      }
    }
    animalCosmetics[animalId] = matched;
    counts.animalCosmetics += matched.size;
  }

  // ── Spells ──
  const spells = new Set<SpellId>();
  const validSpells = new Set(Object.keys(trackerData.mines.spells));

  for (const id of save?.spells_learned ?? []) {
    if (validSpells.has(id)) {
      spells.add(id as SpellId);
    } else {
      warnings.push(`Unknown spell: ${id}`);
    }
  }
  counts.spells = spells.size;

  // ── Perks ──
  const perkIds = new Set<PerkId>();
  const validPerks = new Set(
    recordValues(trackerData.skills).flatMap((skill) =>
      skill.perkTiers.flatMap((tier) => recordKeys(tier)),
    ) as string[],
  );

  for (const id of save?.perks ?? []) {
    if (validPerks.has(id)) {
      perkIds.add(id as PerkId);
    } else {
      warnings.push(`Unknown perk: ${id}`);
    }
  }
  counts.perks = perkIds.size;

  // ── Museum donations (from gamedata.json → museum_progress) ──
  const museumIds = new Set<ItemId>();
  if (bundle.gamedata?.museum_progress) {
    const validMuseum = new Set<string>(
      recordValues(trackerData.museum).flatMap(({ sets }) =>
        recordValues(sets).flatMap(({ items }) => items),
      ),
    );
    for (const id of bundle.gamedata.museum_progress) {
      if (validMuseum.has(id)) {
        museumIds.add(id as ItemId);
      }
    }
    counts.museum = museumIds.size;
  }

  // ── Mine floor (from gamedata.json → maximum_mines_level) ──
  const biomes = trackerData.mines.biomes;
  const mineFloor = bundle.gamedata?.maximum_mines_level
    ? Math.min(
        Math.floor(bundle.gamedata.maximum_mines_level),
        biomes[biomes.length - 1].floors.end,
      )
    : 0;
  counts.mineFloor = mineFloor;

  // ── NPC levels, skill levels, renown (from gamedata.json → t2_world_facts) ──
  const npcLevels: Record<string, number> = {};
  const skillLevels: Record<string, number> = {};
  let renown = 0;

  const facts = bundle.gamedata?.t2_world_facts;
  if (facts) {
    // NPC heart levels: "{npc}_heart_level" keys in t2_world_facts
    const validNpcs = new Set(Object.keys(trackerData.npcs));
    for (const npcId of validNpcs) {
      const level = facts[`${npcId}_heart_level`];
      if (typeof level === "number" && level > 0) {
        npcLevels[npcId] = Math.floor(level);
        counts.npcLevels++;
      }
    }

    // Skill levels: "{skill}_level" keys in t2_world_facts
    const validSkills = new Set(Object.keys(trackerData.skills));
    for (const skillId of validSkills) {
      const level = facts[`${skillId}_level`];
      if (typeof level === "number" && level > 0) {
        skillLevels[skillId] = Math.min(Math.floor(level), 60);
        counts.skillLevels++;
      }
    }

    // Renown level
    if (typeof facts.renown === "number") {
      renown = Math.floor(facts.renown);
      counts.renown = renown;
    }
  }

  // ── Quest completion (from quests.json) ──
  const questStates: Record<string, QuestState> = {};
  if (bundle.quests) {
    const validQuests = new Set<string>();
    for (const category of Object.values(trackerData.quests)) {
      for (const questId of Object.keys(category)) {
        validQuests.add(questId);
      }
    }

    // Completed quests
    for (const id of bundle.quests.completed_quests ?? []) {
      if (validQuests.has(id)) {
        questStates[id] = "completed";
        counts.quests++;
      }
    }

    // Active quests → "obtained"
    for (const quest of bundle.quests.active_quests ?? []) {
      const id = quest.quest_name;
      if (id && validQuests.has(id)) {
        questStates[id] = "obtained";
        counts.quests++;
      }
    }
  }

  return {
    completed: {
      almanac: almanacIds,
      almanacRecipes,
      animalCosmetics,
      animals: animalVariants,
      cosmetics: cosmeticIds,
      mines: { floor: mineFloor, spells },
      museum: museumIds,
      npcLevels,
      questStates,
      renown,
      skillLevels,
      unlockedPerks: perkIds,
    },
    result: {
      counts,
      warnings,
    },
  };
}

// ─── .sav file unpacking (client-side) ──────────────────────────────

export { parseSavFile as unpackSavFile } from "./parse-sav.js";

// ─── Parse save files ----------------───────────────────────────────

const SAVE_FILES = new Set(["gamedata.json", "player.json", "quests.json"]);

export function parsePlayerSave(jsonString: string): {
  error?: string;
  save?: PlayerSave;
} {
  try {
    const data: unknown = JSON.parse(jsonString);
    if (!validatePlayerSave(data)) {
      return {
        error:
          "This doesn't look like a Fields of Mistria player.json file. Expected fields like items_acquired or cosmetic_unlocks.",
      };
    }
    return { save: data };
  } catch {
    return { error: "Invalid JSON. Make sure you selected your player.json file." };
  }
}

// ─── Legacy single-file parse (kept for backward compatibility) ─────

export async function parseSaveFiles(files: File[]): Promise<{
  bundle?: SaveBundle;
  error?: string;
}> {
  const bundle: SaveBundle = {};
  const errors: string[] = [];

  for (const file of files) {
    if (!SAVE_FILES.has(file.name)) continue;

    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      if (typeof data !== "object" || data === null) {
        errors.push(`${file.name}: not a valid JSON object`);
        continue;
      }

      switch (file.name) {
        case "gamedata.json":
          bundle.gamedata = data;
          break;
        case "player.json":
          if (validatePlayerSave(data)) {
            bundle.player = data;
          } else {
            errors.push("player.json: missing expected fields");
          }
          break;
        case "quests.json":
          bundle.quests = data;
          break;
      }
    } catch {
      errors.push(`${file.name}: invalid JSON`);
    }
  }

  if (!bundle.player && !bundle.gamedata && !bundle.quests) {
    return {
      error:
        errors.length > 0
          ? errors.join(". ")
          : "No recognized save files found. Select player.json, gamedata.json, and/or quests.json from your extracted save.",
    };
  }

  return { bundle };
}

// ─── Validation ─────────────────────────────────────────────────────

export function validatePlayerSave(data: unknown): data is PlayerSave {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.items_acquired) ||
    Array.isArray(obj.recipe_unlocks) ||
    Array.isArray(obj.cosmetic_unlocks) ||
    typeof obj.animal_variant_unlocks === "object" ||
    typeof obj.items_sold === "object" ||
    Array.isArray(obj.spells_learned) ||
    Array.isArray(obj.perks)
  );
}
