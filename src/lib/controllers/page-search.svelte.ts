import { getContext, setContext, untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";

import { getCompletionScope } from "#lib/controllers/completion-scope.svelte.js";
import { shelfFacts } from "#lib/engine/shelves.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { AvailabilityRow } from "#lib/engine/availability.js";
import type { ShelfRow } from "#lib/engine/shelves.js";
import type { PageSearchCount } from "#lib/stores/toolbar-state.svelte.js";

const SEARCH_GROUP = Symbol("page-search-group");

type SearchGroup = SvelteMap<symbol, () => PageSearchCount>;

/**
 * Collects the counts of the content below it, so `/everything` can drop a category the search
 * found nothing in.
 */
export function createSearchGroup(): { readonly isEmpty: boolean } {
  const group: SearchGroup = new SvelteMap();
  setContext(SEARCH_GROUP, group);
  return {
    get isEmpty() {
      return [...group.values()].every((count) => count().visible === 0);
    },
  };
}

/**
 * Reports what this part of the page holds, for the page's status note. `count` runs only during a
 * search or while filters narrow the page, so it can afford to look past them.
 */
export function registerPageSearch(count: () => PageSearchCount): void {
  const group = getContext<SearchGroup | undefined>(SEARCH_GROUP);
  // Everything's completed copy shows the same rows as its outstanding copy, so it reports nothing.
  const reportsToPage = !getCompletionScope()?.completed;
  const key = Symbol("page-search");
  $effect(() => {
    untrack(() => {
      group?.set(key, count);
      if (reportsToPage) toolbarState.registerPageSearch(key, count);
    });
    return () => {
      untrack(() => {
        group?.delete(key);
        toolbarState.unregisterPageSearch(key);
      });
    };
  });
}

/** A row's shelf facts under the page's filters. */
export function pageShelfFacts(row: AvailabilityRow, completed: boolean): ShelfRow {
  return shelfFacts(row, completed, userState.progressContext, toolbarState.showsSource);
}
