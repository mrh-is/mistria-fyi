import { trackerData } from "$lib/data/index.js";

import type { CompletedState, MergeCounts } from "$lib/stores/user-state.svelte.js";
import type { CosmeticId, ItemId, SpellId, VariantId } from "$lib/types/tracker-data.js";

// ─── Import result ──────────────────────────────────────────────────

export interface ImportResult {
  /** Per-category counts of items imported */
  counts: MergeCounts;
  /** Human-readable warnings (e.g. unknown IDs) */
  warnings: string[];
}

// ─── Player.json shape (subset we care about) ───────────────────────

interface PlayerSave {
  animal_cosmetic_unlocks?: Record<string, string[]>;
  animal_variant_unlocks?: Record<string, string[]>;
  cosmetic_unlocks?: string[];
  items_acquired?: string[];
  items_sold?: Record<string, unknown>;
  recipes_created?: string[];
  spells_learned?: string[];
}

// ─── Core import logic ──────────────────────────────────────────────

export function buildImportState(save: PlayerSave): {
  completed: Partial<CompletedState>;
  result: ImportResult;
} {
  const warnings: string[] = [];
  const counts: MergeCounts = {
    almanac: 0,
    animalCosmetics: 0,
    animals: 0,
    cosmetics: 0,
    mineFloor: 0,
    museum: 0,
    npcLevels: 0,
    quests: 0,
    renown: 0,
    skillLevels: 0,
    spells: 0,
  };

  // ── Almanac: union of items_acquired + items_sold keys + recipes_created ──
  const almanacIds = new Set<ItemId>();
  const validItems = new Set(Object.keys(trackerData.items));

  const allPlayerItems = new Set<string>([
    ...(save.items_acquired ?? []),
    ...Object.keys(save.items_sold ?? {}),
    ...(save.recipes_created ?? []),
  ]);

  for (const id of allPlayerItems) {
    if (validItems.has(id)) {
      almanacIds.add(id as ItemId);
    }
  }
  counts.almanac = almanacIds.size;

  // ── Cosmetics ──
  const cosmeticIds = new Set<CosmeticId>();
  const validCosmetics = new Set(Object.keys(trackerData.cosmetics));

  for (const id of save.cosmetic_unlocks ?? []) {
    if (validCosmetics.has(id)) {
      cosmeticIds.add(id as CosmeticId);
    } else {
      warnings.push(`Unknown cosmetic: ${id}`);
    }
  }
  counts.cosmetics = cosmeticIds.size;

  // ── Animal variants ──
  const animalVariants: Record<string, Set<VariantId>> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const validVariants = new Set(Object.keys(animal.variants));
    const playerVariants = save.animal_variant_unlocks?.[animalId] ?? [];
    const matched = new Set<VariantId>();

    for (const v of playerVariants) {
      if (validVariants.has(v)) {
        matched.add(v as VariantId);
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
    const playerCosmetics = save.animal_cosmetic_unlocks?.[animalId] ?? [];
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

  for (const id of save.spells_learned ?? []) {
    if (validSpells.has(id)) {
      spells.add(id as SpellId);
    } else {
      warnings.push(`Unknown spell: ${id}`);
    }
  }
  counts.spells = spells.size;

  // ── Categories we CANNOT import ──
  // Museum donations: not in player.json
  // NPC hearts: not in player.json
  // Quests: not in player.json
  // Skills (maxed): XP thresholds unknown
  // Renown: XP-to-level conversion unknown
  // Mine floor: only milestone progression available, not exact floor

  return {
    completed: {
      almanac: almanacIds,
      animalCosmetics,
      animals: animalVariants,
      cosmetics: cosmeticIds,
      mines: { floor: 0, spells },
    },
    result: {
      counts,
      warnings,
    },
  };
}

// ─── Parse + validate in one step ───────────────────────────────────

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

// ─── Validation ─────────────────────────────────────────────────────

export function validatePlayerSave(data: unknown): data is PlayerSave {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  // Must have at least one importable field
  return (
    Array.isArray(obj["items_acquired"]) ||
    Array.isArray(obj["cosmetic_unlocks"]) ||
    typeof obj["animal_variant_unlocks"] === "object" ||
    typeof obj["items_sold"] === "object" ||
    Array.isArray(obj["spells_learned"])
  );
}
