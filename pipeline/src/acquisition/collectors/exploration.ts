import { isNonEmptyArray } from "#lib/utils/record.js";

import { forEachItem, minesBiomeId, scrollTargetOf } from "../../extractor-helpers.js";
import { addRecipeScrollSource } from "../recipe-target.js";

import type { LocationId } from "#lib/types/acquisition.js";
import type { CosmeticId, ItemId, PerkId, TreasureChestTierId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse/parse-fiddle.js";
import type { RecipeAcquisitionContext } from "../recipe-target.js";
import type { CosmeticSourceAccumulator, ItemSourceAccumulator } from "../source-accumulator.js";

export function collectExplorationSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
  recipes: RecipeAcquisitionContext,
): void {
  collectMineBiomeSources(fiddle, accumulator, cosmeticAccumulator, recipes);
  collectPerfectOreSources(fiddle, accumulator);
  collectWishingWellSources(fiddle, accumulator, cosmeticAccumulator, recipes);
  collectFishingChestSources(fiddle, accumulator, cosmeticAccumulator, recipes);
  collectArtifactDigSources(fiddle, accumulator);
  collectArtifactReplicaSources(fiddle, accumulator);
  collectEquipmentCosmeticSources(fiddle, cosmeticAccumulator);
}

function collectArtifactDigSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const artifacts = fiddle.artifacts as Record<string, unknown> | undefined;
  if (!artifacts) return;

  const loot = artifacts.loot as Record<string, string> | undefined;
  if (!loot) return;

  const locations = artifacts.locations as Record<string, string> | undefined;

  for (const [itemId] of Object.entries(loot)) {
    const locationIds = locations
      ? Object.entries(locations)
          .filter(([, setName]) => {
            const setItems = getArtifactSetItems(fiddle, setName);
            return setItems.includes(itemId);
          })
          .map(([locId]) => locId as LocationId)
      : undefined;

    accumulator.add(itemId as ItemId, {
      ...(locationIds && isNonEmptyArray(locationIds) ? { locationIds } : {}),
      type: "artifact_dig",
    });
  }
}

function collectArtifactReplicaSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const items = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  const replicaSet = items?.furniture?.artifact_replica_set;
  if (!replicaSet || typeof replicaSet !== "object") return;

  for (const replicaId of Object.keys(replicaSet)) {
    if (replicaId === "default") continue;
    const originalId = replicaId.replace("artifact_replica_", "");
    accumulator.add(replicaId as ItemId, {
      type: "artifact_replicator",
      originalItemId: originalId as ItemId,
    });
  }
}

function collectEquipmentCosmeticSources(
  fiddle: ParsedGameData,
  cosmeticAccumulator: CosmeticSourceAccumulator,
): void {
  forEachItem(fiddle, (itemId, item) => {
    const cosmeticToUnlock = item.cosmetic_to_unlock as string | undefined;
    if (cosmeticToUnlock) {
      cosmeticAccumulator.add(cosmeticToUnlock as CosmeticId, {
        type: "equipment",
        itemId: itemId as ItemId,
      });
    }
  });
}

function collectFishingChestSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
  recipes: RecipeAcquisitionContext,
): void {
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return;

  const chestTables = fishing.chest_tables as Record<string, Record<string, unknown>> | undefined;
  if (!chestTables) return;

  for (const [tier, table] of Object.entries(chestTables)) {
    const items = Array.isArray(table.items) ? table.items : [];

    for (const entry of items) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const kind = obj.kind as string | undefined;

      if (kind === "cosmetic") {
        const cosmeticId = obj.cosmetic as CosmeticId | undefined;
        if (cosmeticId) {
          cosmeticAccumulator.add(cosmeticId, {
            type: "treasure_chest",
            tier: tier as TreasureChestTierId,
          });
        }
        continue;
      }

      if (kind === "recipe") {
        if (typeof obj.value === "string") {
          addRecipeScrollSource(
            obj.value,
            { type: "treasure_chest", tier: tier as TreasureChestTierId },
            recipes,
            `fishing/chest_tables/${tier}`,
          );
        }
        continue;
      }

      const value = obj.value as string | undefined;
      if (value && kind === "item") {
        accumulator.add(value as ItemId, {
          type: "treasure_chest",
          tier: tier as TreasureChestTierId,
        });
      }
    }
  }
}

function collectMineBiomeSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
  recipes: RecipeAcquisitionContext,
): void {
  const dungeons = fiddle.dungeons as Record<string, Record<string, unknown>> | undefined;
  if (!dungeons) return;

  const inner = dungeons.dungeons as Record<string, unknown> | undefined;
  const biomes = (inner?.biomes ?? dungeons.biomes) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(biomes)) return;

  for (let i = 0; i < biomes.length; i++) {
    const biome = biomes[i];
    if (typeof biome !== "object" || biome === null) continue;

    const name = (biome.name as string | undefined) ?? `Biome ${i + 1}`;
    const biomeId = minesBiomeId(name);
    for (const [arrayKey, source] of [
      ["taste_maker", { type: "mines_chest", biomeId, perkId: "taste_maker" as PerkId }],
      ["furniture", { type: "mines_dig_site", biomeId, perkId: "natural_beauty" as PerkId }],
    ] as const) {
      const products = Array.isArray(biome[arrayKey]) ? biome[arrayKey] : [];
      for (const product of products) {
        if (typeof product !== "string") continue;
        const recipeId = recipes.recipeIdByItemId.get(product);
        if (recipeId) recipes.sources.add(recipeId, source);
      }
    }

    const cosmetics = Array.isArray(biome.cosmetics)
      ? biome.cosmetics.filter((v): v is string => typeof v === "string")
      : [];
    for (const cosmeticId of cosmetics) {
      cosmeticAccumulator.add(cosmeticId as CosmeticId, { type: "mine", biomeId });
    }

    const armor = Array.isArray(biome.armor)
      ? biome.armor.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of armor) {
      accumulator.add(itemId as ItemId, { type: "mine", biomeId });
    }

    const furniture = Array.isArray(biome.furniture)
      ? biome.furniture.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of furniture) {
      accumulator.add(itemId as ItemId, { type: "mine", biomeId });
    }

    const dungeonDelicacies = Array.isArray(biome.dungeon_delicacies)
      ? biome.dungeon_delicacies.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of dungeonDelicacies) {
      accumulator.add(itemId as ItemId, { type: "mine", biomeId });
    }

    const tasteMaker = Array.isArray(biome.taste_maker)
      ? biome.taste_maker.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of tasteMaker) {
      accumulator.add(itemId as ItemId, { type: "mine", biomeId });
    }
  }
}

function collectPerfectOreSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
): void {
  const dungeons = fiddle.dungeons as Record<string, Record<string, unknown>> | undefined;
  if (!dungeons) return;

  const inner = dungeons.dungeons as Record<string, unknown> | undefined;
  const biomes = (inner?.biomes ?? dungeons.biomes) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(biomes)) return;

  const perfectItems = new Set<string>();
  forEachItem(fiddle, (itemId, item) => {
    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (itemId.startsWith("perfect_") && tags.includes("archaeology")) {
      perfectItems.add(itemId);
    }
  });

  for (let i = 0; i < biomes.length; i++) {
    const biome = biomes[i];
    if (typeof biome !== "object" || biome === null) continue;

    const name = (biome.name as string | undefined) ?? `Biome ${i + 1}`;
    const biomeId = minesBiomeId(name);

    for (const mineralKey of [biome.ore, biome.gem] as (string | undefined)[]) {
      if (!mineralKey) continue;
      const base = mineralKey.replace("ore_", "");
      const candidates = [`perfect_${base}_ore`, `perfect_${base}`];
      for (const candidate of candidates) {
        if (perfectItems.has(candidate)) {
          accumulator.add(candidate as ItemId, { type: "mine", biomeId });
          perfectItems.delete(candidate);
          break;
        }
      }
    }
  }
}

function collectWishingWellSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
  recipes: RecipeAcquisitionContext,
): void {
  const wishingWell = fiddle.wishing_well as Record<string, Record<string, unknown>> | undefined;
  if (!wishingWell) return;

  const misc = fiddle.misc as Record<string, Record<string, unknown>> | undefined;
  const wellMisc = misc?.wishing_well;
  const rollCosts: [string, number][] = [
    ["small_roll", requireNumber(wellMisc?.low_price, "misc.wishing_well.low_price")],
    ["large_roll", requireNumber(wellMisc?.high_price, "misc.wishing_well.high_price")],
  ];

  for (const [, tierData] of Object.entries(wishingWell)) {
    if (typeof tierData !== "object" || tierData === null) continue;

    for (const [rollKey, cost] of rollCosts) {
      const roll = tierData[rollKey];
      if (!Array.isArray(roll)) continue;

      for (const entry of roll) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;
        const scrollTarget = scrollTargetOf(obj);
        if (scrollTarget) {
          addRecipeScrollSource(
            scrollTarget,
            { type: "wishing_well", cost },
            recipes,
            "wishing_well",
          );
        }
        if (typeof obj.cosmetic === "string") {
          cosmeticAccumulator.add(obj.cosmetic as CosmeticId, { type: "wishing_well", cost });
        }
        const itemId = obj.item as ItemId | undefined;
        if (itemId) {
          accumulator.add(itemId, {
            type: "wishing_well",
            cost,
          });
        }
      }
    }
  }
}

function getArtifactSetItems(fiddle: ParsedGameData, setName: string): string[] {
  const wings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!wings) return [];

  for (const wing of Object.values(wings)) {
    if (typeof wing !== "object" || wing === null) continue;
    const sets = wing.sets as Record<string, Record<string, unknown>> | undefined;
    if (!sets) continue;

    const set = sets[setName] as Record<string, unknown> | undefined;
    if (set && Array.isArray(set.items)) {
      return set.items.filter((v): v is string => typeof v === "string");
    }
  }
  return [];
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Invalid or missing numeric value "${path}"`);
  }
  return value;
}
