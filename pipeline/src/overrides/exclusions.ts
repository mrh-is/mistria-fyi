import type { CosmeticId, ItemId } from "#lib/types/tracker-data.js";

import type { CosmeticSourceAccumulator } from "../acquisition/source-accumulator.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { ReviewedEntry } from "./entry.js";

export const UNRESOLVED_COSMETIC_EXCLUSIONS: ReviewedEntry<boolean>[] = [
  {
    evidence:
      "player_assets.toml cosmetic has no reward; wiki March proposal describes furniture only",
    id: "back_gear_march_mistrian_shield",
    reason: "No known player acquisition path",
    value: true,
  },
  {
    evidence: "player_assets.toml cosmetic has no reward; wiki lists under Unknowns",
    id: "head_flower_hat",
    reason: "No known player acquisition path",
    value: true,
  },
];
export function cosmeticExclusions(fiddle: ParsedGameData): ReviewedEntry<boolean>[] {
  const assets = fiddle.player_assets as Record<string, Record<string, unknown>> | undefined;
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const seridia = misc?.seridia_armor;
  if (
    seridia !== undefined &&
    (!Array.isArray(seridia) || seridia.some((id) => typeof id !== "string"))
  ) {
    throw new Error("Invalid native misc.seridia_armor");
  }
  return [
    ...Object.keys(assets ?? {})
      .filter((id) => /^baby_back_.+_(?:darker|lighter)$/.test(id))
      .map((id) => ({
        evidence:
          "player_assets.toml carried-baby LUT with empty name and no player acquisition path",
        id,
        reason: "Internal baby-carrying presentation asset",
        value: true,
      })),
    ...(Array.isArray(seridia) ? (seridia as string[]) : []).map((id) => ({
      evidence: "misc.seridia_armor lists this player_assets entry as Seridia costume equipment",
      id,
      reason: "Villager outfit asset",
      value: true,
    })),
    ...UNRESOLVED_COSMETIC_EXCLUSIONS,
  ];
}
export function getExcludedCosmeticIds(fiddle: ParsedGameData): ReadonlySet<CosmeticId> {
  return new Set(cosmeticExclusions(fiddle).map(({ id }) => id as CosmeticId));
}

/** Native acquisition collectors define the encodings; validate before excluded drafts are skipped. */
export function validateCosmeticExclusionSources(
  fiddle: ParsedGameData,
  nativeSources: CosmeticSourceAccumulator,
): void {
  for (const entry of cosmeticExclusions(fiddle)) {
    if (nativeSources.get(entry.id as CosmeticId).length > 0) {
      throw new Error(
        `Obsolete reviewed cosmetic exclusion entry now encoded in native acquisition sources: ${entry.id}`,
      );
    }
  }
}

/**
 * Cutscene props the game defines as items so a scene can hand them around. No table or script
 * gives one to the player, so the tracker leaves them out.
 */
export const ITEM_EXCLUSION_ENTRIES: ReviewedEntry<boolean>[] = ["balors_crate", "ryis_lumber"].map(
  (id) => ({
    evidence:
      "items/other/misc.toml: cutscene sprite and the description “This shouldn't be in your inventory...”",
    id,
    reason: "Cutscene prop with no player acquisition path",
    value: true,
  }),
);
export const ITEM_EXCLUSIONS: ReadonlySet<ItemId> = new Set(
  ITEM_EXCLUSION_ENTRIES.map(({ id }) => id as ItemId),
);
