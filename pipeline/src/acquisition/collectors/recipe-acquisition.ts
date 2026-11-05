import { collectExplorationSources } from "./exploration.js";
import { collectRecipeOnlySources } from "./recipe-only.js";
import { collectRewardSources } from "./rewards.js";
import { collectStoreSources } from "./stores.js";

import type { ParsedGameData } from "../../parse/parse-fiddle.js";
import type { RequirementContext } from "../../parse/requirements.js";
import type { RecipeAcquisitionContext } from "../recipe-target.js";
import type {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "../source-accumulator.js";

interface OtherSourceAccumulators {
  animalCosmeticSources: AnimalCosmeticSourceAccumulator;
  cosmeticSources: CosmeticSourceAccumulator;
  itemSources: ItemSourceAccumulator;
  petCosmeticSources: PetCosmeticSourceAccumulator;
}

/** Collects recipe acquisition alongside the item & cosmetic sources from the same data. */
export function collectRecipeAcquisitionSources(
  fiddle: ParsedGameData,
  recipeContext: RecipeAcquisitionContext,
  requirementContext: RequirementContext,
  {
    animalCosmeticSources,
    cosmeticSources,
    itemSources,
    petCosmeticSources,
  }: OtherSourceAccumulators,
): void {
  collectRewardSources(
    fiddle,
    itemSources,
    cosmeticSources,
    animalCosmeticSources,
    petCosmeticSources,
    recipeContext,
    requirementContext,
  );
  collectStoreSources(
    fiddle,
    requirementContext,
    itemSources,
    cosmeticSources,
    animalCosmeticSources,
    recipeContext,
  );
  collectExplorationSources(fiddle, itemSources, cosmeticSources, recipeContext);
  collectRecipeOnlySources(fiddle, recipeContext);
}
