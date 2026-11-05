import { getContext, setContext, untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";

import { getCompletionScope } from "#lib/controllers/completion-scope.svelte.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import type { PageSearchCount } from "#lib/stores/toolbar-state.svelte.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";

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
 * Reports what this part of the page found, for the page's search status. `count` runs only during
 * a search, so it can afford to look past the page's filters.
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

/** Whether completed rows render, given the player's setting & any paused filters. */
export function showsCompletedRows(): boolean {
  return userState.state.showCompleted || toolbarState.searchShowsAll;
}

/** The availability windows rows render in, given the player's setting & any paused filters. */
export function visibleWindows(): readonly AvailabilityWindow[] {
  return toolbarState.searchShowsAll ? AVAILABILITY_WINDOWS : userState.state.availabilityWindows;
}
