import { untrack } from "svelte";

import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

import type { Source } from "#lib/types/acquisition.js";

export function registerSourceFilters(
  owner: string,
  getSourceTypes: () => Iterable<Source | Source["type"]>,
): void {
  $effect(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Rebuilt on every run and read only within it.
    const sourceTypes = new Set<Source["type"]>();
    for (const sourceOrType of getSourceTypes()) {
      sourceTypes.add(typeof sourceOrType === "string" ? sourceOrType : sourceOrType.type);
    }
    untrack(() => {
      toolbarState.setSourceFilters(
        owner,
        SOURCE_FILTERS.filter(({ types }) => types.some((type) => sourceTypes.has(type))),
      );
    });
    return () => {
      untrack(() => {
        toolbarState.removeSourceFilters(owner);
      });
    };
  });
}
