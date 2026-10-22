import { animalNameId, getAlmanacEntryNames, getName } from "#lib/data/names.js";
import { projectAlmanac } from "#lib/engine/projections/almanac.js";
import { projectAnimals } from "#lib/engine/projections/animals.js";
import { projectCosmetics } from "#lib/engine/projections/cosmetics.js";
import { projectMuseum } from "#lib/engine/projections/museum.js";
import { projectQuests } from "#lib/engine/projections/quests.js";
import { projectRecipes } from "#lib/engine/projections/recipes.js";
import { projectVillagers } from "#lib/engine/projections/villagers.js";
import { composeDescriptorName } from "#lib/utils/format.js";

import type { LocalizedCategoryId } from "#lib/data/names.js";
import type { SearchCandidate, SearchContext } from "#lib/engine/search.js";
import type { LocaleCode } from "#lib/types/locale.js";

/*
 * Each searchable category turns its own projection into candidates. Search's context projects
 * every category with default availability windows & the player's progression, so `available` &
 * `spoilered` mean the same thing in every provider; providers only decide which rows to offer and
 * how to name them.
 */
/* oxlint-disable jsdoc/require-yields -- every provider shares the contract documented on CategoryDefinition.search */

/** One result per collapsed row, by canonical ID; a row in several sections appears once. */
export function* searchAlmanac({
  locale,
  progressionState,
  projectionContext,
}: SearchContext): Iterable<SearchCandidate> {
  for (const row of projectAlmanac(projectionContext, { progressionState }).rows) {
    if (!row.obtainable || row.spoilered) continue;
    const [name, ...otherLocalizedNames] = getAlmanacEntryNames(row.entry, locale);
    const [englishName, ...otherEnglishNames] = getAlmanacEntryNames(row.entry, "en");
    yield {
      englishName,
      localizedName: name,
      otherEnglishNames,
      otherLocalizedNames,
      result: () => ({
        available: row.available,
        category: "almanac",
        completed: row.completed,
        id: row.canonicalId,
        name,
      }),
    };
  }
}

/** Animal variants, animal cosmetics (matched on the composed name), mounts, & pet collectibles. */
export function* searchAnimals({
  locale,
  progressionState,
  projectionContext,
}: SearchContext): Iterable<SearchCandidate> {
  for (const row of projectAnimals(projectionContext, { progressionState }).rows) {
    if (row.spoilered) continue;
    switch (row.kind) {
      case "cosmetic": {
        const nameId = animalNameId(row.animalId, "cosmetics", row.cosmeticId);
        const coreId = animalNameId(row.animalId, "core");
        const name = getName("animals", nameId, locale);
        const fullName = composeDescriptorName(getName("animals", coreId, locale), name, locale);
        yield {
          englishName: composeDescriptorName(
            getName("animals", coreId, "en"),
            getName("animals", nameId, "en"),
            "en",
          ),
          localizedName: fullName,
          result: () => ({
            available: true,
            category: "animals",
            completed: row.completed,
            fullName,
            id: `${row.animalId}:${row.cosmeticId}`,
            name,
          }),
        };
        break;
      }
      case "mountAppearance":
        yield collectible(row.completed, "mount", row.id, `mount-appearance:${row.id}`, locale);
        break;

      case "mountPerk":
        yield collectible(row.completed, "perks", row.id, `mount-perk:${row.id}`, locale);
        break;

      case "petCosmetic":
        yield collectible(
          row.completed,
          "pets/cosmetic_sets",
          row.id,
          `pet-cosmetic:${row.id}`,
          locale,
        );
        break;

      case "petSkin":
        yield collectible(row.completed, "pets/skins", row.id, `pet-skin:${row.id}`, locale);
        break;

      case "variant": {
        const nameId = animalNameId(row.animalId, "variants", row.variantId);
        const name = getName("animals", nameId, locale);
        yield {
          englishName: getName("animals", nameId, "en"),
          localizedName: name,
          result: () => ({
            available: true,
            category: "animals",
            completed: row.completed,
            detail: getName("animals", animalNameId(row.animalId, "core"), locale),
            id: `${row.animalId}:${row.variantId}`,
            name,
          }),
        };
        break;
      }
    }
  }
}

export function* searchCosmetics({
  locale,
  progressionState,
  projectionContext,
}: SearchContext): Iterable<SearchCandidate> {
  for (const row of projectCosmetics(projectionContext, { progressionState }).rows) {
    if (row.spoilered) continue;
    yield simple("cosmetics", row.id, row.completed, locale);
  }
}

/**
 * Museum results use raw item IDs, not almanac entries. An item in both the Almanac and the Museum
 * yields two results: the completion sets and toggle actions are independent.
 */
export function* searchMuseum({
  locale,
  progressionState,
  projectionContext,
}: SearchContext): Iterable<SearchCandidate> {
  for (const row of projectMuseum(projectionContext, { progressionState }).rows) {
    if (!row.obtainable || row.spoilered) continue;
    const name = getName("items", row.id, locale);
    yield {
      englishName: getName("items", row.id, "en"),
      localizedName: name,
      result: () => ({
        available: row.available,
        category: "museum",
        completed: row.completed,
        id: row.id,
        name,
      }),
    };
  }
}

/** Pregnancy quests are surfaced through their villager, so only the projection's rows appear. */
export function* searchQuests({
  locale,
  progressionState,
  projectionContext,
}: SearchContext): Iterable<SearchCandidate> {
  for (const row of projectQuests(projectionContext, { progressionState }).rows) {
    if (row.spoilered) continue;
    yield simple("quests", row.id, row.completed, locale);
  }
}

/** Recipes are gated by recipe visibility, not item visibility. */
export function* searchRecipes({
  locale,
  progressionState,
  projectionContext,
}: SearchContext): Iterable<SearchCandidate> {
  for (const row of projectRecipes(projectionContext, { progressionState }).rows) {
    if (row.spoilered) continue;
    yield simple("recipes", row.id, row.completed, locale);
  }
}

export function* searchVillagers({
  locale,
  progressionState,
  projectionContext,
}: SearchContext): Iterable<SearchCandidate> {
  for (const row of projectVillagers(projectionContext, { progressionState }).rows) {
    if (row.spoilered) continue;
    yield simple("villagers", row.id, row.completed, locale);
  }
}
/* oxlint-enable jsdoc/require-yields */

/**
 * A pet or mount collectible (a Mistmare perk included): its name is also its full name, so ranking
 * reads it unqualified.
 */
function collectible<Chunk extends "mount" | "perks" | "pets/cosmetic_sets" | "pets/skins">(
  completed: boolean,
  chunk: Chunk,
  nameId: LocalizedCategoryId[Chunk],
  id: string,
  locale: LocaleCode,
): SearchCandidate {
  const name = getName(chunk, nameId, locale);
  return {
    englishName: getName(chunk, nameId, "en"),
    localizedName: name,
    result: () => ({ available: true, category: "animals", completed, fullName: name, id, name }),
  };
}

/** A row whose category shares its name chunk & needs no detail. */
function simple<Category extends "cosmetics" | "quests" | "recipes" | "villagers">(
  category: Category,
  id: LocalizedCategoryId[Category],
  completed: boolean,
  locale: LocaleCode,
): SearchCandidate {
  const name = getName(category, id, locale);
  return {
    englishName: getName(category, id, "en"),
    localizedName: name,
    result: () => ({ available: true, category, completed, id, name }),
  };
}
