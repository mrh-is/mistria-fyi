import { SvelteMap, SvelteSet } from "svelte/reactivity";

import type { SourceFilter, SourceFilterId } from "#lib/data/source-filters.js";
import type { Source } from "#lib/types/acquisition.js";

export class ToolbarState {
  activeSourceIds = $state<SvelteSet<SourceFilterId>>(new SvelteSet());
  searchOpen = $state(false);

  searchQuery = $state("");

  sourceFilters = $state<readonly SourceFilter[]>([]);
  get sourceFilterActive(): boolean {
    return this.sourceFilters.length > 0 && this.activeSourceIds.size !== this.sourceFilters.length;
  }

  private readonly sourceFilterRegistrations = new SvelteMap<string, readonly SourceFilter[]>();

  closeSearch(): void {
    this.searchOpen = false;
    this.searchQuery = "";
  }

  hideAllSourceFilters(): void {
    this.activeSourceIds = new SvelteSet();
  }

  matchesSourceFilters(sources: Source[]): boolean {
    if (!this.sourceFilterActive) return true;
    return (
      sources.length === 0 ||
      sources.some((source) => {
        const group = this.sourceFilters.find((filter) => filter.types.includes(source.type));
        return group === undefined || this.activeSourceIds.has(group.id);
      })
    );
  }

  openSearch(): void {
    this.searchOpen = true;
  }

  removeSourceFilters(owner: string): void {
    this.sourceFilterRegistrations.delete(owner);
    this.rebuildSourceFilters();
  }

  resetSourceFilters(): void {
    this.activeSourceIds = new SvelteSet(this.sourceFilters.map((filter) => filter.id));
  }

  setSearch(query: string): void {
    this.searchQuery = query;
  }

  setSourceFilters(owner: string, filters: readonly SourceFilter[]): void {
    this.sourceFilterRegistrations.set(owner, filters);
    this.rebuildSourceFilters();
  }

  showAllSourceFilters(): void {
    this.resetSourceFilters();
  }

  toggleSourceFilter(filter: SourceFilter): void {
    if (this.activeSourceIds.has(filter.id)) {
      this.activeSourceIds.delete(filter.id);
    } else {
      this.activeSourceIds.add(filter.id);
    }
  }

  private rebuildSourceFilters(): void {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A scratch index; only the sorted array is stored.
    const filtersById = new Map<SourceFilterId, SourceFilter>();
    for (const filters of this.sourceFilterRegistrations.values()) {
      for (const filter of filters) filtersById.set(filter.id, filter);
    }
    // ID order keeps identity and change detection locale-independent; the panel sorts by label.
    const nextFilters = [...filtersById.values()].toSorted((a, b) => a.id.localeCompare(b.id));
    const currentIds = this.sourceFilters.map(({ id }) => id).join("\0");
    const nextIds = nextFilters.map(({ id }) => id).join("\0");
    if (currentIds !== nextIds) {
      this.sourceFilters = nextFilters;
      this.resetSourceFilters();
    }
  }
}

export const toolbarState = new ToolbarState();
