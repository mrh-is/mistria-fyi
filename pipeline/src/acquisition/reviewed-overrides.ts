import { canonicalSourceJson } from "./source-accumulator.js";

import type { MonsterId, Source } from "$lib/types/acquisition.js";
import type { CosmeticId, ItemId, PerkId, QuestId } from "$lib/types/tracker-data.js";
import type { TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";
import type { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";

export interface OverrideDiagnostic {
  kind: "missing-target" | "obsolete-override";
  message: string;
  namespace: "cosmetics" | "items";
  targetId: string;
}

// Wiki: https://fieldsofmistria.wiki.gg/wiki/Void_Cake
// Void Cake is a conditional dialogue reward in "The Dragonsworn Tablet" quest. The player
// receives it by repeatedly refusing to raise friendship with Eiland when speaking to the Priestess.
// No native data table encodes this acquisition path.
export const ITEM_OVERRIDES: Partial<Record<ItemId, Source[]>> = {
  ["void_cake" as ItemId]: [
    {
      questId: "the_dragonsworn_tablet" as QuestId,
      trigger: "dialogue_choice" as const,
      type: "quest" as const,
    },
  ],
};

// Wiki: https://fieldsofmistria.wiki.gg/wiki/Dragon_Cleric_Set
// The Dragon Cleric set (Diadem, Earrings, Robes, Boots, Cape) is obtained from the Ritual
// Chamber in the mines. The Ritual Chamber becomes accessible after unlocking the Lost to History
// perk. No native acquisition table encodes these rewards.
export const COSMETIC_OVERRIDES: Partial<Record<CosmeticId, Source[]>> = {
  ["back_gear_dragon_cleric_cape" as CosmeticId]: [
    { perkId: "lost_to_history" as PerkId, type: "ritual_chamber" as const },
  ],
  ["face_gear_dragon_cleric_earrings" as CosmeticId]: [
    { perkId: "lost_to_history" as PerkId, type: "ritual_chamber" as const },
  ],
  ["head_dragon_cleric_diadem" as CosmeticId]: [
    { perkId: "lost_to_history" as PerkId, type: "ritual_chamber" as const },
  ],
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Mimic
  // The Mimic Hat drops from feeding mimics in the mines. The native data has no drops or
  // feed_reward table for mimics; the reward appears to be determined at runtime.
  ["head_mimic_hat" as CosmeticId]: [
    { monsterId: "mimic" as MonsterId, type: "monster_feed" as const },
  ],
  // Wiki: https://fieldsofmistria.wiki.gg/wiki/Wishing_Well
  // Soup Pot Hat and Teapot Hat are obtainable from the Wishing Well. The native data only stores
  // price configuration; the reward pool is not encoded in the static game data.
  ["head_soup_pot" as CosmeticId]: [
    { cost: { amount: 100, currency: "tesserae" as const }, type: "wishing_well" as const },
  ],
  ["head_teapot" as CosmeticId]: [
    { cost: { amount: 100, currency: "tesserae" as const }, type: "wishing_well" as const },
  ],
  ["robe_dragon_cleric" as CosmeticId]: [
    { perkId: "lost_to_history" as PerkId, type: "ritual_chamber" as const },
  ],
  ["shoes_boots_dragon_cleric" as CosmeticId]: [
    { perkId: "lost_to_history" as PerkId, type: "ritual_chamber" as const },
  ],
};

export function applyReviewedOverrides(
  items: Readonly<Record<string, unknown>>,
  cosmetics: Readonly<Record<string, unknown>>,
  itemAccumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
): OverrideDiagnostic[] {
  const diagnostics: OverrideDiagnostic[] = [];

  for (const [targetId, sources] of Object.entries(ITEM_OVERRIDES) as [ItemId, Source[]][]) {
    if (!(targetId in items)) {
      diagnostics.push({
        kind: "missing-target",
        message: `reviewed item override target "${targetId}" not found in item registry`,
        namespace: "items",
        targetId,
      });
      continue;
    }

    for (const source of sources) {
      const identity = canonicalSourceJson(source);
      const existing = itemAccumulator.get(targetId);
      if (existing.some((s) => canonicalSourceJson(s) === identity)) {
        diagnostics.push({
          kind: "obsolete-override",
          message: `reviewed item override for "${targetId}" matches an existing native source — remove the override`,
          namespace: "items",
          targetId,
        });
        continue;
      }
      itemAccumulator.add(targetId, source, {
        fieldPath: `reviewed-overrides.items.${targetId}`,
        sourcePath: "pipeline/src/acquisition/reviewed-overrides.ts",
      });
    }
  }

  for (const [targetId, sources] of Object.entries(COSMETIC_OVERRIDES) as [
    CosmeticId,
    Source[],
  ][]) {
    if (!(targetId in cosmetics)) {
      diagnostics.push({
        kind: "missing-target",
        message: `reviewed cosmetic override target "${targetId}" not found in cosmetic registry`,
        namespace: "cosmetics",
        targetId,
      });
      continue;
    }

    for (const source of sources) {
      const identity = canonicalSourceJson(source);
      const existing = cosmeticAccumulator.get(targetId);
      if (existing.some((s) => canonicalSourceJson(s) === identity)) {
        diagnostics.push({
          kind: "obsolete-override",
          message: `reviewed cosmetic override for "${targetId}" matches an existing native source — remove the override`,
          namespace: "cosmetics",
          targetId,
        });
        continue;
      }
      cosmeticAccumulator.add(targetId, source, {
        fieldPath: `reviewed-overrides.cosmetics.${targetId}`,
        sourcePath: "pipeline/src/acquisition/reviewed-overrides.ts",
      });
    }
  }

  return diagnostics;
}

const DEFAULT_SOURCE: Source = { type: "default" };

export function collectDefaultCosmeticSources(
  cosmetics: TrackerData["cosmetics"],
  accumulator: CosmeticSourceAccumulator,
): void {
  for (const [id, cosmetic] of Object.entries(cosmetics)) {
    if (cosmetic.defaultUnlocked) {
      accumulator.add(id as CosmeticId, DEFAULT_SOURCE, {
        fieldPath: `cosmetics.${id}.defaultUnlocked`,
        sourcePath: "player_assets.toml",
      });
    }
  }
}

// misc.ari_stats.starting_inventory and misc.ari_stats.starting_armor provide evidence that
// these items are available from the start of the game.
export function collectDefaultItemSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  items: Readonly<Record<string, unknown>>,
): void {
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const ariStats = misc?.ari_stats as Record<string, unknown> | undefined;

  const startingInventory = ariStats?.starting_inventory;
  if (Array.isArray(startingInventory)) {
    for (const itemId of startingInventory) {
      if (typeof itemId === "string" && itemId in items) {
        accumulator.add(itemId as ItemId, DEFAULT_SOURCE, {
          fieldPath: `misc.ari_stats.starting_inventory`,
          sourcePath: "misc.toml",
        });
      }
    }
  }

  const startingArmor = ariStats?.starting_armor as Record<string, string> | undefined;
  if (startingArmor) {
    for (const [slot, itemId] of Object.entries(startingArmor)) {
      if (typeof itemId === "string" && itemId in items) {
        accumulator.add(itemId as ItemId, DEFAULT_SOURCE, {
          fieldPath: `misc.ari_stats.starting_armor.${slot}`,
          sourcePath: "misc.toml",
        });
      }
    }
  }
}
