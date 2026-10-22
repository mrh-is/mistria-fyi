import { SvelteMap, SvelteSet } from "svelte/reactivity";

import type { SourceFilter, SourceFilterId } from "#lib/data/source-filters.js";
import type { Source } from "#lib/types/acquisition.js";

/** The filter-panel sections that collapse into disclosures on phones. */
export type FilterSectionId = "availability" | "sources";

export class ToolbarState {
  enabledSourceFilterIds = $state<SvelteSet<SourceFilterId>>(new SvelteSet());
  // Phone-width disclosure state; session-only, so sections start collapsed on each visit.
  readonly expandedFilterSections = new SvelteSet<FilterSectionId>();
  searchOpen = $state(false);

  searchQuery = $state("");

  // A temporary page filter, like source selection; never part of saved progress.
  showUnobtainable = $state(false);

  get hasAlmanacFilters(): boolean {
    return this.sourceFilterRegistrations.has("almanac");
  }

  sourceFilters = $state<readonly SourceFilter[]>([]);
  get isSourceFilterNarrowing(): boolean {
    return (
      this.sourceFilters.length > 0 &&
      this.enabledSourceFilterIds.size !== this.sourceFilters.length
    );
  }

  private readonly sourceFilterRegistrations = new SvelteMap<string, readonly SourceFilter[]>();

  closeSearch(): void {
    this.searchOpen = false;
    this.searchQuery = "";
  }

  hideAllSourceFilters(): void {
    this.enabledSourceFilterIds = new SvelteSet();
  }

  matchesSourceFilters(sources: Source[]): boolean {
    if (!this.isSourceFilterNarrowing) return true;
    return (
      sources.length === 0 ||
      sources.some((source) => {
        const group = this.sourceFilters.find((filter) => filter.types.includes(source.type));
        return group === undefined || this.enabledSourceFilterIds.has(group.id);
      })
    );
  }

  openSearch(): void {
    this.searchOpen = true;
  }

  registerSourceFilters(owner: string, filters: readonly SourceFilter[]): void {
    this.sourceFilterRegistrations.set(owner, filters);
    this.rebuildSourceFilters();
  }

  resetSourceFilters(): void {
    this.enabledSourceFilterIds = new SvelteSet(this.sourceFilters.map((filter) => filter.id));
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
  }

  toggleFilterSection(section: FilterSectionId): void {
    if (this.expandedFilterSections.has(section)) {
      this.expandedFilterSections.delete(section);
    } else {
      this.expandedFilterSections.add(section);
    }
  }

  toggleSourceFilter(filter: SourceFilter): void {
    if (this.enabledSourceFilterIds.has(filter.id)) {
      this.enabledSourceFilterIds.delete(filter.id);
    } else {
      this.enabledSourceFilterIds.add(filter.id);
    }
  }

  unregisterSourceFilters(owner: string): void {
    this.sourceFilterRegistrations.delete(owner);
    this.rebuildSourceFilters();
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
