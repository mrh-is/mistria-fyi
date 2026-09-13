import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";

import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";

import type { Source } from "$lib/types/acquisition.js";

export function registerSourceFilters(
  owner: string,
  getSourceTypes: () => Iterable<Source | Source["type"]>,
): void {
  $effect(() => {
    const sourceTypes = new SvelteSet<Source["type"]>();
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
