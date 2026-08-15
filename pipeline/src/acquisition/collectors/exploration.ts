import type { LocationId } from "$lib/types/acquisition.js";
import type { BiomeId, CosmeticId, ItemId, TreasureChestTier } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";
import type { CosmeticSourceAccumulator, ItemSourceAccumulator } from "../source-accumulator.js";

export function collectExplorationSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
): void {
  collectMineBiomeSources(fiddle, accumulator, cosmeticAccumulator);
  collectFishingChestSources(fiddle, accumulator, cosmeticAccumulator);
  collectArtifactDigSources(fiddle, accumulator);
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
      ...(locationIds && locationIds.length > 0 ? { locationIds } : {}),
      type: "artifact_dig",
    });
  }
}

function collectFishingChestSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
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
        const cosmeticId = obj.cosmetic as string | undefined;
        if (cosmeticId) {
          cosmeticAccumulator.add(cosmeticId as CosmeticId, {
            tier: tier as TreasureChestTier,
            type: "treasure_chest",
          });
        }
        continue;
      }

      if (kind === "recipe") continue;

      const value = obj.value as string | undefined;
      if (value && kind === "item") {
        accumulator.add(value as ItemId, {
          tier: tier as TreasureChestTier,
          type: "treasure_chest",
        });
      }
    }
  }
}

function collectMineBiomeSources(
  fiddle: ParsedGameData,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
): void {
  const dungeons = fiddle.dungeons as Record<string, unknown> | undefined;
  if (!dungeons) return;

  const biomes = dungeons.biomes as Record<string, unknown>[] | undefined;
  if (!Array.isArray(biomes)) return;

  for (let i = 0; i < biomes.length; i++) {
    const biome = biomes[i];
    if (typeof biome !== "object" || biome === null) continue;

    const biomeId = `biome_${i}` as BiomeId;

    const cosmetics = Array.isArray(biome.cosmetics)
      ? biome.cosmetics.filter((v): v is string => typeof v === "string")
      : [];
    for (const cosmeticId of cosmetics) {
      cosmeticAccumulator.add(cosmeticId as CosmeticId, { biomeId, type: "mine" });
    }

    const armor = Array.isArray(biome.armor)
      ? biome.armor.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of armor) {
      accumulator.add(itemId as ItemId, { biomeId, type: "mine" });
    }

    const furniture = Array.isArray(biome.furniture)
      ? biome.furniture.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of furniture) {
      accumulator.add(itemId as ItemId, { biomeId, type: "mine" });
    }

    const dungeonDelicacies = Array.isArray(biome.dungeon_delicacies)
      ? biome.dungeon_delicacies.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of dungeonDelicacies) {
      accumulator.add(itemId as ItemId, { biomeId, type: "mine" });
    }

    const tasteMaker = Array.isArray(biome.taste_maker)
      ? biome.taste_maker.filter((v): v is string => typeof v === "string")
      : [];
    for (const itemId of tasteMaker) {
      accumulator.add(itemId as ItemId, { biomeId, type: "mine" });
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
