import { recordEntries } from "$lib/utils";

import type { CosmeticId } from "$lib/types/tracker-data.js";

export interface CosmeticExclusion {
  evidence: string;
  id: CosmeticId;
  reason: string;
}

// Baby back cosmetics: internal presentation assets for the carried-baby visual. They have no
// player unlock path, no default_unlocked flag, no store listing, no quest reward, and no
// equipment reference. Their names are empty strings in the native data.
const BABY_BACK_IDS = [
  "baby_back_astrid_darker",
  "baby_back_astrid_lighter",
  "baby_back_brid_darker",
  "baby_back_brid_lighter",
  "baby_back_cedar_darker",
  "baby_back_cedar_lighter",
  "baby_back_ellie_darker",
  "baby_back_ellie_lighter",
  "baby_back_fray_darker",
  "baby_back_fray_lighter",
  "baby_back_kam_darker",
  "baby_back_kam_lighter",
  "baby_back_rowan_darker",
  "baby_back_rowan_lighter",
  "baby_back_rune_darker",
  "baby_back_rune_lighter",
  "baby_back_sterling_darker",
  "baby_back_sterling_lighter",
  "baby_back_tephra_darker",
  "baby_back_tephra_lighter",
  "baby_back_torin_darker",
  "baby_back_torin_lighter",
  "baby_back_wilder_darker",
  "baby_back_wilder_lighter",
] as CosmeticId[];

// Seridia's Dragonsworn armor variants: NPC outfit assets listed in misc.seridia_armor. They
// appear in player_assets but have no player unlock path, no default_unlocked, no store listing,
// and no reward reference. The list is an NPC costume configuration, not a player acquisition path.
const SERIDIA_ARMOR_IDS = [
  "back_gear_dragonsworn_cloak_seridia",
  "head_dragonsworn_helmet_seridia",
  "pants_dragonsworn_armor_seridia",
  "shoes_boots_dragonsworn_armor_seridia",
  "top_dragonsworn_armor_seridia",
] as CosmeticId[];

// head_flower_hat: Listed under "Unknowns" on the wiki with no acquisition details. No store,
// quest, museum, renown, monster, dungeon, or festival reference found in native data. Likely
// unreleased content.
// back_gear_march_mistrian_shield: The wiki describes March's proposal furniture item
// (marchs_mistrian_shield) but establishes no unlock path for this separate cosmetic. No store,
// quest, museum, or reward reference found in native data.
const UNRESOLVED_EXCLUSION_IDS = [
  "back_gear_march_mistrian_shield",
  "head_flower_hat",
] as CosmeticId[];

export const COSMETIC_EXCLUSIONS: CosmeticExclusion[] = [
  ...BABY_BACK_IDS.map((id): CosmeticExclusion => ({
    evidence: "player_assets entry has empty name, lut-only fields, no unlock path",
    id,
    reason: "internal baby-carrying presentation asset",
  })),
  ...SERIDIA_ARMOR_IDS.map((id): CosmeticExclusion => ({
    evidence: "misc.seridia_armor lists these as NPC outfit, no player unlock path in data",
    id,
    reason: "NPC outfit asset (Seridia's Dragonsworn armor variant)",
  })),
  ...UNRESOLVED_EXCLUSION_IDS.map((id): CosmeticExclusion => ({
    evidence:
      id === ("head_flower_hat" as CosmeticId)
        ? "wiki lists under Unknowns, no acquisition path in native data"
        : "wiki describes furniture item only, no cosmetic unlock path in native data",
    id,
    reason: "no known player acquisition path",
  })),
];

const EXCLUDED_COSMETIC_SET = new Set<CosmeticId>(COSMETIC_EXCLUSIONS.map((e) => e.id));

export interface ExclusionReferenceDiagnostic {
  excludedId: CosmeticId;
  message: string;
  referencePath: string;
}

export function applyExclusions<T>(cosmetics: Record<CosmeticId, T>): Record<CosmeticId, T> {
  const result = {} as Record<CosmeticId, T>;
  for (const [id, value] of recordEntries(cosmetics)) {
    if (!EXCLUDED_COSMETIC_SET.has(id)) {
      result[id] = value;
    }
  }
  return result;
}

export function getExcludedCosmeticIds(): ReadonlySet<CosmeticId> {
  return EXCLUDED_COSMETIC_SET;
}

export function isExcludedCosmetic(id: CosmeticId): boolean {
  return EXCLUDED_COSMETIC_SET.has(id);
}

export function validateExclusionReferences(
  almanac: readonly { items?: Readonly<Record<string, unknown>> }[] | undefined,
  museum: readonly { sets?: readonly { items?: readonly string[] }[] }[] | undefined,
  recipes: Readonly<Record<string, { memberItemIds?: readonly string[] }>> | undefined,
  cosmeticSources: Readonly<Record<string, unknown>> | undefined,
): ExclusionReferenceDiagnostic[] {
  const diagnostics: ExclusionReferenceDiagnostic[] = [];

  if (almanac) {
    for (let catIdx = 0; catIdx < almanac.length; catIdx++) {
      const category = almanac[catIdx];
      if (category.items) {
        for (const itemId of Object.keys(category.items)) {
          if (EXCLUDED_COSMETIC_SET.has(itemId as CosmeticId)) {
            diagnostics.push({
              excludedId: itemId as CosmeticId,
              message: `excluded cosmetic "${itemId}" referenced in almanac category ${catIdx}`,
              referencePath: `almanac[${catIdx}].items.${itemId}`,
            });
          }
        }
      }
    }
  }

  if (museum) {
    for (let wingIdx = 0; wingIdx < museum.length; wingIdx++) {
      const wing = museum[wingIdx];
      if (wing.sets) {
        for (let setIdx = 0; setIdx < wing.sets.length; setIdx++) {
          const set = wing.sets[setIdx];
          if (set.items) {
            for (let itemIdx = 0; itemIdx < set.items.length; itemIdx++) {
              const itemId = set.items[itemIdx];
              if (EXCLUDED_COSMETIC_SET.has(itemId as CosmeticId)) {
                diagnostics.push({
                  excludedId: itemId as CosmeticId,
                  message: `excluded cosmetic "${itemId}" referenced in museum set`,
                  referencePath: `museum[${wingIdx}].sets[${setIdx}].items[${itemIdx}]`,
                });
              }
            }
          }
        }
      }
    }
  }

  if (recipes) {
    for (const [recipeId, recipe] of Object.entries(recipes)) {
      if (recipe.memberItemIds) {
        for (let idx = 0; idx < recipe.memberItemIds.length; idx++) {
          const itemId = recipe.memberItemIds[idx];
          if (EXCLUDED_COSMETIC_SET.has(itemId as CosmeticId)) {
            diagnostics.push({
              excludedId: itemId as CosmeticId,
              message: `excluded cosmetic "${itemId}" referenced as recipe member`,
              referencePath: `recipes.${recipeId}.memberItemIds[${idx}]`,
            });
          }
        }
      }
    }
  }

  if (cosmeticSources) {
    for (const cosmeticId of Object.keys(cosmeticSources)) {
      if (EXCLUDED_COSMETIC_SET.has(cosmeticId as CosmeticId)) {
        diagnostics.push({
          excludedId: cosmeticId as CosmeticId,
          message: `excluded cosmetic "${cosmeticId}" has accumulated sources`,
          referencePath: `cosmeticSources.${cosmeticId}`,
        });
      }
    }
  }

  return diagnostics;
}
