import { trackerData } from "#lib/data/index.js";
import { recipePlacements } from "#lib/engine/projections/recipes.js";
import { NO_ART_ROW_KINDS, noArtEntityReason } from "#lib/sprites/no-art.js";
import { itemSprite } from "#lib/sprites/sprite-url.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import type { CategoryKey } from "#lib/engine/categories.js";
import type { SpriteKind, SpriteRef } from "#lib/sprites/sprite-url.js";
import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";

/** The report category of each Everything row kind, with the category it's listed under. */
export const EVERYTHING_ROW_CATEGORIES = {
  "almanac-item": "almanac",
  "animal-cosmetics": "animals",
  "animal-variants": "animals",
  cosmetic: "cosmetics",
  "mount-appearance": "animals",
  "mount-perk": "animals",
  "museum-item": "museum",
  "pet-cosmetic": "animals",
  "pet-skin": "animals",
  quest: "quests",
  recipe: "recipes",
  spell: "mines",
} as const satisfies Record<string, CategoryKey>;

export type EverythingRowKind = keyof typeof EVERYTHING_ROW_CATEGORIES;

/** What a row's sprite slot shows: the game's art, or the designed placeholder & why. */
export type RowArt = { kind: "none"; reason: string } | { kind: "sprite"; sprite: SpriteRef };

/** The sprite kind each row kind draws from, keyed by the row's own ID. */
const ENTITY_SPRITE_KINDS = {
  "almanac-item": "items",
  "animal-cosmetics": "animal-cosmetics",
  "animal-variants": "animal-variants",
  cosmetic: "cosmetics",
  "mount-appearance": "mount-appearances",
  "mount-perk": "mount-perks",
  "museum-item": "items",
  "pet-cosmetic": "pet-cosmetics",
  "pet-skin": "pet-skins",
  spell: "spells",
} as const satisfies Partial<Record<EverythingRowKind, SpriteKind>>;

let recipeItems: Map<RecipeId, ItemId> | undefined;

/** The almanac item a recipe makes, as the Recipes page pictures it. */
function recipeItem(recipeId: RecipeId): ItemId | undefined {
  if (!recipeItems) {
    recipeItems = new Map();
    for (const { recipes } of recipePlacements()) {
      for (const { itemId, recipeId: id } of recipes) {
        if (!recipeItems.has(id)) recipeItems.set(id, itemId);
      }
    }
  }
  return recipeItems.get(recipeId);
}

/**
 * The art for one Everything row, or undefined when the row has neither a sprite nor a no-art
 * entry: a gap the sprite coverage test reports.
 */
export function everythingRowArt(kind: EverythingRowKind, id: string): RowArt | undefined {
  if (Object.hasOwn(NO_ART_ROW_KINDS, kind)) {
    return { kind: "none", reason: NO_ART_ROW_KINDS[kind as keyof typeof NO_ART_ROW_KINDS] };
  }
  if (kind === "recipe") {
    const itemId = recipeItem(id as RecipeId);
    return itemId ? { kind: "sprite", sprite: itemSprite(itemId) } : undefined;
  }
  const spriteKind = ENTITY_SPRITE_KINDS[kind as keyof typeof ENTITY_SPRITE_KINDS];
  const reason = noArtEntityReason(spriteKind, id);
  if (reason) return { kind: "none", reason };
  return { kind: "sprite", sprite: { id, kind: spriteKind } };
}

/** One Everything row's identity & art, for the coverage report. */
export interface EverythingSpriteRow {
  art: RowArt | undefined;
  category: CategoryKey;
  id: string;
  kind: EverythingRowKind;
}

/**
 * Every row Everything can list, from the tracker data alone. `buildSourceChecklist` lists the same
 * rows through each category's projection; its test keeps the two in step.
 */
export function everythingSpriteRows(): EverythingSpriteRow[] {
  const ids: [EverythingRowKind, string][] = [];
  for (const category of Object.values(trackerData.almanac)) {
    for (const entry of category.items) ids.push(["almanac-item", entry.itemIds[0]]);
  }
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const itemId of set.items) ids.push(["museum-item", itemId]);
    }
  }
  for (const id of recordKeys(trackerData.recipes)) ids.push(["recipe", id]);
  for (const id of recordKeys(trackerData.cosmetics)) ids.push(["cosmetic", id]);
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    for (const tier of animal.variantTiers) {
      for (const variantId of recordKeys(tier)) {
        ids.push(["animal-variants", `${animalId}/${variantId}`]);
      }
    }
    for (const cosmeticId of recordKeys(animal.cosmetics)) {
      ids.push(["animal-cosmetics", `${animalId}/${cosmeticId}`]);
    }
  }
  for (const id of recordKeys(trackerData.mount.appearances)) ids.push(["mount-appearance", id]);
  for (const id of recordKeys(trackerData.mount.perks)) ids.push(["mount-perk", id]);
  for (const id of recordKeys(trackerData.pets.cosmetics)) ids.push(["pet-cosmetic", id]);
  for (const id of recordKeys(trackerData.pets.skins)) ids.push(["pet-skin", id]);
  for (const quests of Object.values(trackerData.quests)) {
    for (const id of Object.keys(quests)) ids.push(["quest", id]);
  }
  for (const id of recordKeys(trackerData.mines.spells)) ids.push(["spell", id]);

  const seen = new Set<string>();
  return ids.flatMap(([kind, id]) => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      { art: everythingRowArt(kind, id), category: EVERYTHING_ROW_CATEGORIES[kind], id, kind },
    ];
  });
}

/** Every sprite Everything & the Renown rewards request, as `<kind>/<id>` keys, sorted. */
export function everythingSpriteKeys(): string[] {
  const keys = new Set<string>();
  for (const { art } of everythingSpriteRows()) {
    if (art?.kind === "sprite") keys.add(`${art.sprite.kind}/${art.sprite.id}`);
  }
  for (const { sprite } of renownRewardSprites()) {
    if (sprite) keys.add(`${sprite.kind}/${sprite.id}`);
  }
  return [...keys].toSorted();
}

export interface RenownRewardSprite {
  id: string;
  level: number;
  sprite?: SpriteRef;
}

/** Each Renown level's non-money reward with the sprite it shows; levels count from 1. */
export function renownRewardSprites(): RenownRewardSprite[] {
  return trackerData.renown.rewards.flatMap((reward, index): RenownRewardSprite[] => {
    const level = index + 1;
    if (reward.type === "item") {
      return [{ id: reward.itemId, level, sprite: itemSprite(reward.itemId) }];
    }
    if (reward.type === "cosmetic") {
      const art = everythingRowArt("cosmetic", reward.cosmeticId);
      return [
        {
          id: reward.cosmeticId,
          level,
          ...(art?.kind === "sprite" ? { sprite: art.sprite } : {}),
        },
      ];
    }
    return [];
  });
}
