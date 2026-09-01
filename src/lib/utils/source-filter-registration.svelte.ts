import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";

import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";

import type { Source } from "$lib/types/acquisition.js";

export function registerSourceFilters(owner: string, getSources: () => Source[]): void {
  $effect(() => {
    const sourceTypes = new SvelteSet(getSources().map(({ type }) => type));
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
