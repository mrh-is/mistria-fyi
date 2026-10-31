import { untrack } from "svelte";

import { getCompletionScope } from "#lib/controllers/completion-scope.svelte.js";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

import type { Source } from "#lib/types/acquisition.js";

export function registerSourceFilters(
  owner: string,
  getSourceTypes: () => Iterable<Source | Source["type"]>,
): void {
  // Everything keeps its outstanding copy mounted. It owns this registration even when empty;
  // removing the completed copy must not unregister the outstanding copy's toolbar controls.
  if (getCompletionScope()?.completed) return;
  $effect(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt on every run and read only within it.
    const sourceTypes = new Set<Source["type"]>();
    for (const sourceOrType of getSourceTypes()) {
      sourceTypes.add(typeof sourceOrType === "string" ? sourceOrType : sourceOrType.type);
    }
    untrack(() => {
      toolbarState.registerSourceFilters(
        owner,
        SOURCE_FILTERS.filter(({ types }) => types.some((type) => sourceTypes.has(type))),
      );
    });
    return () => {
      untrack(() => {
        toolbarState.unregisterSourceFilters(owner);
      });
    };
  });
}
