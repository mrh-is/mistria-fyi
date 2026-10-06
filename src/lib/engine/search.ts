import { trackerData, trackerIndex } from "#lib/data/index.js";
import { animalNameId, getName, nameCollator } from "#lib/data/names.js";
import { isItemApplicable, isItemApplicableForAlmanac } from "#lib/engine/applicability.js";
import { isItemAvailable } from "#lib/engine/availability.js";
import { isVillagerComplete } from "#lib/engine/progress.js";
import { isVisible } from "#lib/engine/visibility.js";
import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { composeInfusion } from "#lib/utils/format.js";
import { recordEntries } from "#lib/utils/record.js";

import type { SearchCategoryKey } from "#lib/data/categories.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { ItemId, QuestId, Season, Weather } from "#lib/types/tracker-data.js";
import type { CompletedState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

export interface SearchResult {
  available: boolean;
  category: SearchCategoryKey;
  completed: boolean;
  detail?: string;
  fullName?: string;
  id: string;
  name: string;
}

const MAX_RESULTS = 50;

interface SearchContext {
  completed: DeepReadonly<CompletedState>;
  locale: LocaleCode;
  progressionState: UserProgressionState;
  worldState: { season: Season; weather: Weather };
}

/**
 * One searchable entity. `localizedName` & `englishName` are the strings matched against the
 * query, so an English query still finds an entity while browsing another locale; `result` builds
 * the displayed row only for a match.
 */
interface SearchCandidate {
  englishName: string;
  localizedName: string;
  result: () => SearchResult;
}

type SearchSource = (context: SearchContext) => Iterable<SearchCandidate>;

/**
 * Every searchable category as a generator of candidates. Each source applies its own visibility
 * & applicability rules; matching, ranking, & truncation are shared. Source order is the stable
 * order for equally ranked results.
 */
/* oxlint-disable jsdoc/require-yields -- table entries share the contract documented on SearchSource */
const SEARCH_SOURCES: readonly SearchSource[] = [
  // Almanac entries: one result per collapsed row, canonical ID
  function* almanac({ completed, locale, progressionState, worldState }) {
    const seen = new Set<ItemId>();
    for (const entry of trackerIndex.almanacEntries) {
      const canonicalId = entry.itemIds[0];
      if (seen.has(canonicalId)) continue;
      seen.add(canonicalId);
      const item = trackerData.items[canonicalId];
      if (item.visibility && !isVisible(item.visibility, progressionState)) continue;
      if (!isItemApplicableForAlmanac(entry.itemIds, completed)) continue;
      const name = getName("items", canonicalId, locale);
      yield {
        englishName: getName("items", canonicalId, "en"),
        localizedName: name,
        result: () => ({
          available: isItemAvailable(
            trackerIndex.getAggregatedAlmanacSources(canonicalId),
            worldState,
            DEFAULT_AVAILABILITY_WINDOWS,
          ),
          category: "almanac",
          completed: completed.almanac.has(canonicalId),
          id: canonicalId,
          name,
        }),
      };
    }
  },

  // Museum items use raw item IDs, not almanac entries. An item in both the Almanac and the
  // Museum yields two results: the completion sets and toggle actions are independent.
  function* museum({ completed, locale, progressionState, worldState }) {
    for (const wing of Object.values(trackerData.museum)) {
      for (const set of Object.values(wing.sets)) {
        for (const id of set.items) {
          const item = trackerData.items[id];
          if (item.visibility && !isVisible(item.visibility, progressionState)) continue;
          if (!isItemApplicable(id, completed)) continue;
          const name = getName("items", id, locale);
          yield {
            englishName: getName("items", id, "en"),
            localizedName: name,
            result: () => ({
              available: isItemAvailable(item.sources, worldState, DEFAULT_AVAILABILITY_WINDOWS),
              category: "museum",
              completed: completed.museum.has(id),
              id,
              name,
            }),
          };
        }
      }
    }
  },

  function* villagers({ completed, locale, progressionState }) {
    for (const [id, villager] of recordEntries(trackerData.villagers)) {
      if (villager.visibility && !isVisible(villager.visibility, progressionState)) continue;
      const name = getName("villagers", id, locale);
      yield {
        englishName: getName("villagers", id, "en"),
        localizedName: name,
        result: () => ({
          available: true,
          category: "villagers",
          completed: isVillagerComplete(id, completed),
          id,
          name,
        }),
      };
    }
  },

  function* animalVariants({ completed, locale, progressionState }) {
    for (const [animalId, animal] of recordEntries(trackerData.animals)) {
      if (animal.visibility && !isVisible(animal.visibility, progressionState)) continue;
      for (const tier of animal.variantTiers) {
        for (const [variantId] of recordEntries(tier)) {
          const nameId = animalNameId(animalId, "variants", variantId);
          const name = getName("animals", nameId, locale);
          yield {
            englishName: getName("animals", nameId, "en"),
            localizedName: name,
            result: () => ({
              available: true,
              category: "animals",
              completed: completed.animals[animalId].has(variantId),
              detail: getName("animals", animalNameId(animalId, "core"), locale),
              id: `${animalId}:${variantId}`,
              name,
            }),
          };
        }
      }
    }
  },

  // Cosmetics match on the composed "animal + cosmetic" name
  function* animalCosmetics({ completed, locale, progressionState }) {
    for (const [animalId, animal] of recordEntries(trackerData.animals)) {
      if (animal.visibility && !isVisible(animal.visibility, progressionState)) continue;
      for (const [cosmeticId] of recordEntries(animal.cosmetics)) {
        const nameId = animalNameId(animalId, "cosmetics", cosmeticId);
        const coreId = animalNameId(animalId, "core");
        const name = getName("animals", nameId, locale);
        const fullName = composeInfusion(getName("animals", coreId, locale), name, locale);
        yield {
          englishName: composeInfusion(
            getName("animals", coreId, "en"),
            getName("animals", nameId, "en"),
            "en",
          ),
          localizedName: fullName,
          result: () => ({
            available: true,
            category: "animals",
            completed: completed.animalCosmetics[animalId].has(cosmeticId),
            fullName,
            id: `${animalId}:${cosmeticId}`,
            name,
          }),
        };
      }
    }
  },

  function* petCosmetics({ completed, locale }) {
    for (const [id] of recordEntries(trackerData.pets.cosmetics)) {
      const name = getName("pets/cosmetic_sets", id, locale);
      yield {
        englishName: getName("pets/cosmetic_sets", id, "en"),
        localizedName: name,
        result: () => ({
          available: true,
          category: "animals",
          completed: completed.petCosmetics.has(id),
          fullName: name,
          id: `pet-cosmetic:${id}`,
          name,
        }),
      };
    }
  },

  function* petSkins({ completed, locale }) {
    for (const [id] of recordEntries(trackerData.pets.skins)) {
      const name = getName("pets/skins", id, locale);
      yield {
        englishName: getName("pets/skins", id, "en"),
        localizedName: name,
        result: () => ({
          available: true,
          category: "animals",
          completed: completed.petSkins.has(id),
          fullName: name,
          id: `pet-skin:${id}`,
          name,
        }),
      };
    }
  },

  // Recipes are gated by recipe visibility, not item visibility
  function* recipes({ completed, locale, progressionState }) {
    for (const [id, recipe] of recordEntries(trackerData.recipes)) {
      if (recipe.visibility && !isVisible(recipe.visibility, progressionState)) continue;
      const name = getName("recipes", id, locale);
      yield {
        englishName: getName("recipes", id, "en"),
        localizedName: name,
        result: () => ({
          available: true,
          category: "recipes",
          completed: completed.almanacRecipes.has(id),
          id,
          name,
        }),
      };
    }
  },

  function* cosmetics({ completed, locale, progressionState }) {
    for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
      if (cosmetic.visibility && !isVisible(cosmetic.visibility, progressionState)) continue;
      const name = getName("cosmetics", id, locale);
      yield {
        englishName: getName("cosmetics", id, "en"),
        localizedName: name,
        result: () => ({
          available: true,
          category: "cosmetics",
          completed: completed.cosmetics.has(id),
          id,
          name,
        }),
      };
    }
  },

  // Pregnancy quests are surfaced through their villager, not individually
  function* quests({ completed, locale, progressionState }) {
    const pregnancyQuestIds = new Set(
      Object.values(trackerData.pregnancyQuestByVillager).filter(
        (id): id is QuestId => id !== undefined,
      ),
    );
    for (const [, byType] of recordEntries(trackerData.quests)) {
      for (const [id, quest] of recordEntries(byType)) {
        if (pregnancyQuestIds.has(id)) continue;
        if (quest.visibility && !isVisible(quest.visibility, progressionState)) continue;
        const name = getName("quests", id, locale);
        yield {
          englishName: getName("quests", id, "en"),
          localizedName: name,
          result: () => ({
            available: true,
            category: "quests",
            completed: completed.questStates[id] === "completed",
            id,
            name,
          }),
        };
      }
    }
  },
];
/* oxlint-enable jsdoc/require-yields */

export function searchItems(
  query: string,
  completed: DeepReadonly<CompletedState>,
  worldState: { season: Season; weather: Weather },
  progressionState: UserProgressionState,
  locale: LocaleCode,
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const context: SearchContext = { completed, locale, progressionState, worldState };
  const results: SearchResult[] = [];
  for (const source of SEARCH_SOURCES) {
    for (const candidate of source(context)) {
      if (
        candidate.localizedName.toLowerCase().includes(q) ||
        candidate.englishName.toLowerCase().includes(q)
      ) {
        results.push(candidate.result());
      }
    }
  }

  return rankResults(results, q, locale).slice(0, MAX_RESULTS);
}

/** Prefix matches first, then available before unavailable, then alphabetical */
function rankResults(results: SearchResult[], query: string, locale: LocaleCode): SearchResult[] {
  const collator = nameCollator(locale);
  return results.toSorted((a, b) => {
    const aName = (a.fullName ?? a.name).toLowerCase();
    const bName = (b.fullName ?? b.name).toLowerCase();
    const aPrefix = aName.startsWith(query) ? 0 : 1;
    const bPrefix = bName.startsWith(query) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    if (a.available !== b.available) return a.available ? -1 : 1;
    return collator.compare(aName, bName);
  });
}
