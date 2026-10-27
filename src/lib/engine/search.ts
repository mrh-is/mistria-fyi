import { nameCollator } from "#lib/data/names.js";
import { CATEGORY_DEFINITIONS } from "#lib/engine/categories.js";
import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { foldName } from "#lib/utils/name-match.js";

import type { SearchCategoryKey } from "#lib/engine/categories.js";
import type { ProgressContext } from "#lib/engine/progress.js";
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
  /** The item pictured on the result's category-page row; absent where that row has no picture. */
  sprite?: ItemId;
}

/**
 * One searchable entity. `localizedName` & `englishName` are the strings matched against the
 * query, so an English query still finds an entity while browsing another locale; `result` builds
 * the displayed row only for a match.
 */
export interface SearchCandidate {
  englishName: string;
  localizedName: string;
  /** Further names matched the same way, such as the other members of a merged almanac row. */
  otherEnglishNames?: readonly string[];
  otherLocalizedNames?: readonly string[];
  result: () => SearchResult;
}

/**
 * What a search provider reads: its category's projection in `projectionContext`, with spoilers
 * flagged from `progressionState`, named in `locale`.
 */
export interface SearchContext {
  locale: LocaleCode;
  progressionState: UserProgressionState;
  projectionContext: ProgressContext;
}

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

  // Search's own context, independent of page filters and completed-row retention: default
  // availability windows, with spoilers flagged from the player's progression. Registry order is
  // the stable order for equally ranked results.
  const context: SearchContext = {
    locale,
    progressionState,
    projectionContext: {
      availabilityWindows: DEFAULT_AVAILABILITY_WINDOWS,
      progress: completed,
      worldState,
    },
  };
  const results: SearchResult[] = [];
  for (const { search } of CATEGORY_DEFINITIONS) {
    if (!search) continue;
    for (const candidate of search(context)) {
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

  return rankResults(results, q, locale);
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
