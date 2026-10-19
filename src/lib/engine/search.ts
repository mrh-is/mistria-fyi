import { trackerData, trackerIndex } from "#lib/data/index.js";
import { animalNameId, getAlmanacEntryNames, getName, nameCollator } from "#lib/data/names.js";
import { isAlmanacEntryObtainable, isItemObtainable } from "#lib/engine/applicability.js";
import { isItemAvailable } from "#lib/engine/availability.js";
import { PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
import { isVillagerComplete } from "#lib/engine/progress.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { composeDescriptorName } from "#lib/utils/format.js";
import { foldName } from "#lib/utils/name-match.js";
import { recordEntries } from "#lib/utils/record.js";

import type { SearchCategoryKey } from "#lib/data/categories.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { ItemId, Season, Weather } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
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
  completed: DeepReadonly<ProgressState>;
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
  /** Further names matched the same way, such as the other members of a merged almanac row. */
  otherEnglishNames?: readonly string[];
  otherLocalizedNames?: readonly string[];
  result: () => SearchResult;
}

type SearchProvider = (context: SearchContext) => Iterable<SearchCandidate>;

/**
 * Every searchable category as a generator of candidates. Each source applies its own visibility
 * & applicability rules; matching, ranking, & truncation are shared. Source order is the stable
 * order for equally ranked results.
 */
/* oxlint-disable jsdoc/require-yields -- table entries share the contract documented on SearchProvider */
const SEARCH_PROVIDERS: readonly SearchProvider[] = [
  // Almanac entries: one result per collapsed row, canonical ID
  function* almanac({ completed, locale, progressionState, worldState }) {
    const seen = new Set<ItemId>();
    for (const entry of trackerIndex.almanacEntries) {
      const canonicalId = entry.itemIds[0];
      if (seen.has(canonicalId)) continue;
      seen.add(canonicalId);
      const item = trackerData.items[canonicalId];
      if (item.visibility && !isConditionVisible(item.visibility, progressionState)) continue;
      if (!isAlmanacEntryObtainable(entry.itemIds, completed)) continue;
      const [name, ...otherLocalizedNames] = getAlmanacEntryNames(entry, locale);
      const [englishName, ...otherEnglishNames] = getAlmanacEntryNames(entry, "en");
      yield {
        englishName,
        localizedName: name,
        otherEnglishNames,
        otherLocalizedNames,
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
          if (item.visibility && !isConditionVisible(item.visibility, progressionState)) continue;
          if (!isItemObtainable(id, completed)) continue;
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
      if (villager.visibility && !isConditionVisible(villager.visibility, progressionState)) {
        continue;
      }
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
      if (animal.visibility && !isConditionVisible(animal.visibility, progressionState)) continue;
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
              completed: completed.animals[animalId]?.has(variantId) ?? false,
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
      if (animal.visibility && !isConditionVisible(animal.visibility, progressionState)) continue;
      for (const [cosmeticId] of recordEntries(animal.cosmetics)) {
        const nameId = animalNameId(animalId, "cosmetics", cosmeticId);
        const coreId = animalNameId(animalId, "core");
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
            completed: completed.animalCosmetics[animalId]?.has(cosmeticId) ?? false,
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
      if (recipe.visibility && !isConditionVisible(recipe.visibility, progressionState)) continue;
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
      if (cosmetic.visibility && !isConditionVisible(cosmetic.visibility, progressionState)) {
        continue;
      }
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
    for (const [, byType] of recordEntries(trackerData.quests)) {
      for (const [id, quest] of recordEntries(byType)) {
        if (PREGNANCY_QUEST_IDS.has(id)) continue;
        if (quest.visibility && !isConditionVisible(quest.visibility, progressionState)) continue;
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

export function searchAllCategories(
  query: string,
  completed: DeepReadonly<ProgressState>,
  worldState: { season: Season; weather: Weather },
  progressionState: UserProgressionState,
  locale: LocaleCode,
): SearchResult[] {
  const q = foldName(query.trim(), locale);
  const englishQ = foldName(query.trim(), "en");
  if (!q) return [];

  const context: SearchContext = { completed, locale, progressionState, worldState };
  const results: SearchResult[] = [];
  for (const source of SEARCH_PROVIDERS) {
    for (const candidate of source(context)) {
      const localizedNames = [candidate.localizedName, ...(candidate.otherLocalizedNames ?? [])];
      const englishNames = [candidate.englishName, ...(candidate.otherEnglishNames ?? [])];
      if (
        localizedNames.some((name) => foldName(name, locale).includes(q)) ||
        englishNames.some((name) => foldName(name, "en").includes(englishQ))
      ) {
        results.push(candidate.result());
      }
    }
  }

  return rankResults(results, q, locale).slice(0, MAX_RESULTS);
}

/**
 * Prefix matches first, then available before unavailable, then alphabetical. `foldedQuery` is
 * already folded per `foldName`.
 */
function rankResults(
  results: SearchResult[],
  foldedQuery: string,
  locale: LocaleCode,
): SearchResult[] {
  const collator = nameCollator(locale);
  const ranked = results.map((result) => {
    const name = result.fullName ?? result.name;
    return { name, prefix: foldName(name, locale).startsWith(foldedQuery), result };
  });
  return ranked
    .toSorted((a, b) => {
      if (a.prefix !== b.prefix) return a.prefix ? -1 : 1;
      if (a.result.available !== b.result.available) return a.result.available ? -1 : 1;
      return collator.compare(a.name, b.name);
    })
    .map(({ result }) => result);
}
