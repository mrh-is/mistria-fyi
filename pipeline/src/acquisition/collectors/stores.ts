import { simplifyAvailabilityCondition } from "#lib/engine/availability-condition.js";

import { expectStringArray } from "../../data-shapes.js";
import { forEachItem, forEachStockEntry } from "../../extractor-helpers.js";
import { resolveToVisibility } from "../../extractors/visibility/requirement-resolver.js";
import { sourceFileFor } from "../../parse-fiddle.js";
import { parseRequirements } from "../../requirements.js";
import { projectRequirementExpressionToAvailability } from "../availability.js";
import { addRecipeScrollSource } from "../recipe-target.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { AnimalId, CosmeticId, ItemId, Season, StoreId } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { SourceFieldLocation } from "../../data-shapes.js";
import type { ParsedGameData } from "../../parse-fiddle.js";
import type { RequirementContext } from "../../requirements.js";
import type { RecipeAcquisitionContext } from "../recipe-target.js";
import type {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
} from "../source-accumulator.js";

export function collectStoreSources(
  fiddle: ParsedGameData,
  requirementContext: RequirementContext,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
  animalCosmeticAccumulator: AnimalCosmeticSourceAccumulator,
  recipes: RecipeAcquisitionContext,
): void {
  const bundleByItem = new Map<string, { name: string; setTag: string }>();
  const recipeProductTags = new Map<string, string[]>();
  forEachItem(fiddle, (itemId, item, category, subcategory) => {
    if (typeof item.set_unlock === "string") {
      bundleByItem.set(itemId, {
        name: typeof item.name === "string" ? item.name : itemId,
        setTag: item.set_unlock,
      });
    }
    if (recipes.recipeIdByItemId.has(itemId)) {
      recipeProductTags.set(
        itemId,
        item.tags === undefined
          ? []
          : expectStringArray(item.tags, {
              entityId: itemId,
              fieldPath: "tags",
              sourcePath: sourceFileFor(fiddle, `items.${category}.${subcategory}.${itemId}`),
            }),
      );
    }
  });
  const bundleListings = new Map<
    string,
    {
      availability?: AvailabilityCondition;
      bundleName: string;
      storeId: StoreId;
      visibility?: VisibilityCondition;
    }
  >();
  forEachStockEntry(fiddle, (storeId, entry, season) => {
    const seasonAvailability: AvailabilityCondition | undefined =
      season === undefined ? undefined : { type: "season", seasons: [season as Season] };
    const obj =
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : undefined;
    let itemId: string | undefined;
    if (typeof entry === "string") itemId = entry;
    else if (typeof obj?.item === "string") itemId = obj.item;
    const bundle = itemId ? bundleByItem.get(itemId) : undefined;
    if (bundle) {
      const projected = projectStockRequirements(
        obj?.requirements,
        `${storeId}/${itemId}`,
        requirementContext,
      );
      const listing = {
        availability: combineAvailability(seasonAvailability, projected.availability),
        bundleName: bundle.name,
        storeId: storeId as StoreId,
        ...(projected.visibility.type === "always" ? {} : { visibility: projected.visibility }),
      };
      const existing = bundleListings.get(bundle.setTag);
      if (existing && JSON.stringify(existing) !== JSON.stringify(listing)) {
        throw new Error(
          `Scroll bundle set "${bundle.setTag}" has conflicting store listings: ${JSON.stringify(existing)} and ${JSON.stringify(listing)}`,
        );
      }
      bundleListings.set(bundle.setTag, listing);
    }
    processStoreEntry(
      entry,
      storeId,
      seasonAvailability,
      requirementContext,
      accumulator,
      cosmeticAccumulator,
      animalCosmeticAccumulator,
      recipes,
    );
  });
  for (const [itemId, tags] of recipeProductTags) {
    const recipeId = recipes.recipeIdByItemId.get(itemId);
    if (!recipeId) continue;
    for (const [setTag, listing] of bundleListings) {
      if (!tags.includes(setTag)) continue;
      recipes.sources.add(recipeId, {
        type: "scroll_bundle",
        bundleName: listing.bundleName,
        storeId: listing.storeId,
        ...(listing.availability ? { availability: listing.availability } : {}),
        ...(listing.visibility ? { visibility: listing.visibility } : {}),
      });
    }
  }
}

function buildStoreSource(
  storeId: string,
  availability: AvailabilityCondition | undefined,
): Source {
  return {
    ...(availability ? { availability } : {}),
    type: "store",
    storeId: storeId as StoreId,
  };
}

function combineAvailability(
  base: AvailabilityCondition | undefined,
  requirement: AvailabilityCondition | undefined,
): AvailabilityCondition | undefined {
  if (!base && !requirement) return undefined;
  if (!base) return requirement;
  if (!requirement) return base;
  if (requirement.type === "always") return base;
  return simplifyAvailabilityCondition({
    type: "all",
    conditions: [base, requirement],
  });
}

function processStoreEntry(
  entry: unknown,
  storeId: string,
  baseAvailability: AvailabilityCondition | undefined,
  requirementContext: RequirementContext,
  accumulator: ItemSourceAccumulator,
  cosmeticAccumulator: CosmeticSourceAccumulator,
  animalCosmeticAccumulator: AnimalCosmeticSourceAccumulator,
  recipes: RecipeAcquisitionContext,
): void {
  if (typeof entry === "string") {
    const source = buildStoreSource(storeId, baseAvailability);
    accumulator.add(entry as ItemId, source);
    return;
  }

  if (typeof entry !== "object" || entry === null) return;
  const obj = entry as Record<string, unknown>;

  const scrollTarget = obj.recipe_scroll ?? obj.crafting_scroll;
  const includedRecipeId =
    obj.include_recipe === true && typeof obj.item === "string"
      ? recipes.recipeIdByItemId.get(obj.item)
      : undefined;
  const recipeTarget = typeof scrollTarget === "string" ? scrollTarget : includedRecipeId;
  if (recipeTarget) {
    const projected = projectStockRequirements(
      obj.requirements,
      `${storeId}/${recipeTarget}`,
      requirementContext,
    );
    const availability = combineAvailability(baseAvailability, projected.availability);
    const source: Source = {
      ...buildStoreSource(storeId, availability),
      ...(projected.visibility.type === "always" ? {} : { visibility: projected.visibility }),
    };
    if (typeof scrollTarget === "string") {
      addRecipeScrollSource(scrollTarget, source, recipes, `stores/${storeId}`);
    } else if (includedRecipeId) {
      recipes.sources.add(includedRecipeId, source);
    }
    if (!obj.item) return;
  }

  const animalCosmeticId = obj.animal_cosmetic as CosmeticId | undefined;
  const animalId = obj.animal as AnimalId | undefined;
  if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
    const requirementAvailability = projectStockRequirements(
      obj.requirements,
      `${storeId}/${animalId}:${animalCosmeticId}`,
      requirementContext,
    ).availability;
    const availability = combineAvailability(baseAvailability, requirementAvailability);
    const source = buildStoreSource(storeId, availability);
    animalCosmeticAccumulator.add(animalId, animalCosmeticId, source);
    return;
  }

  const itemId = obj.item as ItemId | undefined;
  const cosmeticId = obj.cosmetic as CosmeticId | undefined;
  const targetId = itemId ?? cosmeticId;
  if (!targetId) return;

  const requirementAvailability = projectStockRequirements(
    obj.requirements,
    `${storeId}/${targetId}`,
    requirementContext,
  ).availability;

  const availability = combineAvailability(baseAvailability, requirementAvailability);
  const source = buildStoreSource(storeId, availability);

  if (cosmeticId && cosmeticAccumulator) {
    cosmeticAccumulator.add(targetId as CosmeticId, source);
  } else {
    accumulator.add(targetId as ItemId, source);
  }
}

export function projectStockRequirements(
  requirements: unknown,
  entityId: string,
  context: RequirementContext,
): { availability: AvailabilityCondition | undefined; visibility: VisibilityCondition } {
  const location: SourceFieldLocation = {
    entityId,
    fieldPath: "requirements",
    sourcePath: "fiddle/stores.toml",
  };
  const expression = parseRequirements(
    requirements,
    context.namedRequirements,
    context.primitivePredicates,
    location,
  );
  return {
    availability:
      requirements === undefined
        ? undefined
        : projectRequirementExpressionToAvailability(expression, context, location),
    visibility: resolveToVisibility(expression, context.cutsceneMap),
  };
}
