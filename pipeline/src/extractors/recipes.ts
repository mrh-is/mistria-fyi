import { LOCALE_CODES } from "#lib/types/locale.js";

import { collectExplorationSources } from "../acquisition/collectors/exploration.js";
import { collectRecipeOnlySources } from "../acquisition/collectors/recipe-only.js";
import { collectRewardSources } from "../acquisition/collectors/rewards.js";
import { collectStoreSources } from "../acquisition/collectors/stores.js";
import {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
  RecipeSourceAccumulator,
} from "../acquisition/source-accumulator.js";
import { PipelineDiagnostics } from "../diagnostics.js";
import { appendToMultimap, forEachItem } from "../extractor-helpers.js";
import { compareStrings } from "../ordering.js";
import { createRequirementContext } from "../requirements.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { ItemId, Recipe, RecipeId } from "#lib/types/tracker-data.js";

import type { RecipeAcquisitionContext } from "../acquisition/recipe-target.js";
import type { SourceDraft } from "../acquisition/required-sources.js";
import type { ParsedGameData } from "../parse-fiddle.js";
import type { CutsceneQuestMap } from "./visibility/cutscene-quest-map.js";

export interface RecipeNameSource {
  englishName: string;
  itemId: ItemId;
}

interface RawRecipeEntry {
  isDefault: boolean;
  itemId: string;
  name: string;
  recipeId: string;
}

export function deriveRecipeLocaleNames(
  sources: Record<RecipeId, RecipeNameSource>,
  itemLocaleNames: Record<LocaleCode, Record<ItemId, string>>,
): Record<LocaleCode, Record<RecipeId, string>> {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<RecipeId, string>
  >;
  for (const [recipeId, source] of Object.entries(sources) as [RecipeId, RecipeNameSource][]) {
    localeNames.en[recipeId] = source.englishName;
    for (const locale of LOCALE_CODES) {
      if (locale === "en") continue;
      const name = itemLocaleNames[locale][source.itemId];
      if (!name) {
        throw new Error(`Recipe "${recipeId}" has no "${locale}" item name for "${source.itemId}"`);
      }
      localeNames[locale][recipeId] = name;
    }
  }
  return localeNames;
}

/**
 * Extracts recipe identity, names, & native defaults. In assembly, pass the shared accumulator
 * and collect acquisition after this function. Standalone callers use the same collectors here.
 */
export function extractRecipes(
  fiddle: ParsedGameData,
  cutsceneMap: CutsceneQuestMap = {},
  sharedDiagnostics?: PipelineDiagnostics,
  sharedSources?: RecipeSourceAccumulator,
): {
  recipeIdByItemId: Map<string, RecipeId>;
  recipeMemberItems: Map<RecipeId, ItemId[]>;
  recipeNameSources: Record<RecipeId, RecipeNameSource>;
  recipes: Record<RecipeId, SourceDraft<Recipe>>;
} {
  const diagnostics = sharedDiagnostics ?? new PipelineDiagnostics();
  const entries = collectRecipeEntries(fiddle);
  const itemIdToRecipeId = new Map<string, string>();
  const grouped = new Map<string, RawRecipeEntry[]>();
  for (const entry of entries) {
    itemIdToRecipeId.set(entry.itemId, entry.recipeId);
    appendToMultimap(grouped, entry.recipeId, entry);
  }
  validateRecipeIdCollisions(itemIdToRecipeId, grouped, diagnostics);

  const recipeIdByItemId = new Map<string, RecipeId>();
  for (const [itemId, recipeId] of itemIdToRecipeId) {
    recipeIdByItemId.set(itemId, recipeId as RecipeId);
  }
  const sources = sharedSources ?? new RecipeSourceAccumulator();
  const context: RecipeAcquisitionContext = {
    diagnostics,
    knownRecipeIds: new Set(grouped.keys()),
    recipeIdByItemId,
    sources,
  };

  const recipes: Record<RecipeId, SourceDraft<Recipe>> = {};
  const recipeNameSources = {} as Record<RecipeId, RecipeNameSource>;
  const recipeMemberItems = new Map<RecipeId, ItemId[]>();
  for (const [recipeId, group] of grouped) {
    const typedRecipeId = recipeId as RecipeId;
    const memberItemIds = group.map((entry) => entry.itemId as ItemId).toSorted(compareStrings);
    recipeMemberItems.set(typedRecipeId, memberItemIds);
    const flags = group.map((entry) => entry.isDefault);
    const allDefault = flags.every(Boolean);
    if (flags.some(Boolean) && !allDefault) {
      diagnostics.add({
        fieldPath: `recipes.${recipeId}.recipe_is_default`,
        kind: "mixed-recipe-default",
        message: `recipe "${recipeId}" has mixed recipe_is_default flags`,
        targetId: recipeId,
      });
    }
    if (allDefault) sources.add(typedRecipeId, { type: "default" });
    recipeNameSources[typedRecipeId] = deriveRecipeNameSource(recipeId, group);
    recipes[typedRecipeId] = { sources: [] };
  }

  if (!sharedSources) {
    const items = new ItemSourceAccumulator();
    const cosmetics = new CosmeticSourceAccumulator();
    const animalCosmetics = new AnimalCosmeticSourceAccumulator();
    const petCosmetics = new PetCosmeticSourceAccumulator();
    const requirements = createRequirementContext(
      fiddle.requirements as Record<string, unknown> | undefined,
      cutsceneMap,
    );
    collectRewardSources(
      fiddle,
      items,
      cosmetics,
      animalCosmetics,
      petCosmetics,
      context,
      requirements,
    );
    collectStoreSources(fiddle, requirements, items, cosmetics, animalCosmetics, context);
    collectExplorationSources(fiddle, items, cosmetics, context);
    collectRecipeOnlySources(fiddle, context);
    for (const recipeId of Object.keys(recipes) as RecipeId[]) {
      recipes[recipeId].sources = sources.get(recipeId);
    }
  }

  if (!sharedDiagnostics) diagnostics.validate();
  return { recipeIdByItemId, recipeMemberItems, recipeNameSources, recipes };
}

function collectRecipeEntries(fiddle: ParsedGameData): RawRecipeEntry[] {
  const entries: RawRecipeEntry[] = [];

  forEachItem(fiddle, (itemId, item, _topCat, subCatKey) => {
    if (subCatKey === "unreviewed_new_items") return;

    const hasRecipe = Array.isArray(item.recipe) || typeof item.recipe_key === "string";
    const isDefault = item.recipe_is_default === true;

    if (!hasRecipe && isDefault) {
      console.log(
        `  Diagnostic: "${itemId}" has recipe_is_default but no recipe array or recipe_key — skipped`,
      );
      return;
    }

    if (!hasRecipe) return;

    const recipeKey = item.recipe_key as string | undefined;
    const recipeId = recipeKey ?? itemId;
    const name = (item.name as string | undefined) ?? itemId;

    entries.push({ isDefault, itemId, name, recipeId });
  });

  return entries;
}

function deriveRecipeNameSource(recipeId: string, group: RawRecipeEntry[]): RecipeNameSource {
  const uniqueNames = [...new Set(group.map((e) => e.name))].toSorted(compareStrings);
  if (uniqueNames.length === 1) {
    return {
      englishName: uniqueNames[0],
      itemId: group.map(({ itemId }) => itemId).toSorted(compareStrings)[0] as ItemId,
    };
  }

  if (uniqueNames.length === 2) {
    const plainBed = uniqueNames.find(
      (name) =>
        name.endsWith(" Single Bed") || (name.endsWith(" Bed") && !name.endsWith(" Double Bed")),
    );
    const doubleBed = uniqueNames.find((n) => n.endsWith(" Double Bed"));
    if (plainBed && doubleBed) {
      const prefix = doubleBed.slice(0, -" Double Bed".length);
      const representative = group
        .filter(({ name }) => name === plainBed)
        .map(({ itemId }) => itemId)
        .toSorted(compareStrings)[0];
      return { englishName: `${prefix} Bed`, itemId: representative as ItemId };
    }
  }

  throw new Error(
    `Recipe "${recipeId}" has ${uniqueNames.length} distinct presentation names: ${uniqueNames.join(", ")}`,
  );
}

function validateRecipeIdCollisions(
  itemIdToRecipeId: Map<string, string>,
  grouped: Map<string, RawRecipeEntry[]>,
  diagnostics: PipelineDiagnostics,
): void {
  for (const [itemId, recipeId] of itemIdToRecipeId) {
    if (itemId === recipeId) continue;
    if (grouped.has(itemId) && itemId !== recipeId) {
      diagnostics.add({
        fieldPath: `recipes.${itemId}`,
        kind: "recipe-id-collision",
        message: `item ID "${itemId}" is also a recipe key for a different group`,
        targetId: itemId,
      });
    }
  }
}
