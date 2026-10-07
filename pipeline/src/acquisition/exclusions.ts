import type { CosmeticId, ItemId } from "#lib/types/tracker-data.js";

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

// Seridia's Dragonsworn armor variants: villager outfit assets listed in misc.seridia_armor. They
// appear in player_assets but have no player unlock path, no default_unlocked, no store listing,
// and no reward reference. The list is a villager costume configuration, not a player acquisition path.
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
    evidence: "misc.seridia_armor lists these as villager outfit, no player unlock path in data",
    id,
    reason: "Villager outfit asset (Seridia's Dragonsworn armor variant)",
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

export function getExcludedCosmeticIds(): ReadonlySet<CosmeticId> {
  return EXCLUDED_COSMETIC_SET;
}

export function isExcludedCosmetic(id: CosmeticId): boolean {
  return EXCLUDED_COSMETIC_SET.has(id);
}

/**
 * Cutscene props the game defines as items so a scene can hand them around. Each uses a cutscene
 * sprite and the description “This shouldn't be in your inventory...”, and no table or script
 * gives one to the player, so the tracker leaves them out.
 */
export const ITEM_EXCLUSIONS: ReadonlySet<ItemId> = new Set([
  "balors_crate",
  "ryis_lumber",
] as ItemId[]);
