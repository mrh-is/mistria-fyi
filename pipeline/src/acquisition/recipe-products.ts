import { forEachItem } from "../extractor-helpers.js";

import type { Source } from "$lib/types/acquisition.js";
import type { ItemId, ProductionMethod, RecipeId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";
import type { ItemSourceAccumulator } from "./source-accumulator.js";

interface ItemMethodEntry {
  itemId: string;
  method: ProductionMethod;
}

export function deriveProductionMethod(
  itemId: ItemId,
  fiddle: ParsedGameData,
): ProductionMethod | undefined {
  let result: ProductionMethod | undefined;

  forEachItem(fiddle, (id, item, topCat, subCat) => {
    if (id !== itemId) return;

    if (topCat === "other" && subCat === "cooked_dishes") {
      result = "cook";
      return;
    }

    const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];

    if (tags.includes("milling")) {
      result = "mill";
      return;
    }

    if (tags.includes("blacksmithing")) {
      result = id.startsWith("dragon_forged_") ? "dragon_forge" : "smith";
      return;
    }

    if (topCat === "furniture") {
      result = "craft";
    }
  });

  return result;
}

export function deriveRecipeProductSources(
  fiddle: ParsedGameData,
  recipes: Record<RecipeId, { memberItemIds: ItemId[] }>,
  accumulator: ItemSourceAccumulator,
): void {
  const methodByItemId = buildMethodIndex(fiddle);

  for (const [recipeId, recipe] of Object.entries(recipes)) {
    const method = resolveRecipeMethod(recipeId as RecipeId, recipe.memberItemIds, methodByItemId);
    if (!method) continue;

    const source: Source = {
      method,
      recipeId: recipeId as RecipeId,
      type: "recipe",
    };

    for (const itemId of recipe.memberItemIds) {
      accumulator.add(itemId, source);
    }
  }
}

function buildMethodIndex(fiddle: ParsedGameData): Map<string, ProductionMethod> {
  const index = new Map<string, ProductionMethod>();

  forEachItem(fiddle, (itemId, item, topCat, subCat) => {
    if (topCat === "other" && subCat === "cooked_dishes") {
      index.set(itemId, "cook");
      return;
    }

    const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];

    if (tags.includes("milling")) {
      index.set(itemId, "mill");
      return;
    }

    if (tags.includes("blacksmithing")) {
      index.set(itemId, itemId.startsWith("dragon_forged_") ? "dragon_forge" : "smith");
      return;
    }

    if (topCat === "furniture" && (item.recipe || item.recipe_key)) {
      index.set(itemId, "craft");
    }
  });

  return index;
}

function resolveRecipeMethod(
  recipeId: RecipeId,
  memberItemIds: ItemId[],
  methodByItemId: Map<string, ProductionMethod>,
): ProductionMethod | undefined {
  const methods = new Set<ProductionMethod>();
  const entries: ItemMethodEntry[] = [];

  for (const itemId of memberItemIds) {
    const method = methodByItemId.get(itemId);
    if (method) {
      methods.add(method);
      entries.push({ itemId, method });
    }
  }

  if (methods.size === 0) return undefined;
  if (methods.size === 1) return entries[0].method;

  const detail = entries.map((e) => `${e.itemId}=${e.method}`).join(", ");
  throw new Error(
    `Recipe "${recipeId}" has conflicting production methods among its members: ${detail}`,
  );
}
