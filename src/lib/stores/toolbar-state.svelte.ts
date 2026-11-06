import { SvelteMap, SvelteSet } from "svelte/reactivity";

import type { SourceFilter, SourceFilterId } from "#lib/data/source-filters.js";
import type { FilteredCounts } from "#lib/engine/shelves.js";
import type { Source } from "#lib/types/acquisition.js";

/** What one part of a page holds, given the current search & filters. */
export interface PageSearchCount {
  /** What the filters take from each shelf, among the rows that match any search. */
  filtered: FilteredCounts;
  /** The matching rows on screen now. */
  visible: number;
}

/** The filter-panel sections that collapse into disclosures on phones. */
export type FilterSectionId = "show" | "sources";

export class ToolbarState {
  enabledSourceFilterIds = $state<SvelteSet<SourceFilterId>>(new SvelteSet());
  // Phone-width disclosure state; session-only, so sections start collapsed on each visit.
  readonly expandedFilterSections = new SvelteSet<FilterSectionId>();
  // Pixels an open toolbar panel occupies above the viewport bottom; toasts rise above it.
  panelClearance = $state(0);
  searchOpen = $state(false);

  searchQuery = $state("");

  // Shows every match for the current search; the player's filters themselves never change.
  searchShowsAll = $state(false);

  // A temporary page filter, like source selection; never part of saved progress.
  showUnobtainable = $state(false);

  get hasAlmanacFilters(): boolean {
    return this.sourceFilterRegistrations.has("almanac");
  }

  /** The page's totals: what's on screen, & what the filters take from each shelf. */
  get pageSearchCount(): PageSearchCount {
    const filtered: FilteredCounts = { completed: 0, notNow: 0, todo: 0 };
    let visible = 0;
    for (const count of this.pageSearchCounters.values()) {
      const part = count();
      filtered.completed += part.filtered.completed;
      filtered.notNow += part.filtered.notNow;
      filtered.todo += part.filtered.todo;
      visible += part.visible;
    }
    return { filtered, visible };
  }

  sourceFilters = $state<readonly SourceFilter[]>([]);
  get isSourceFilterNarrowing(): boolean {
    return (
      this.sourceFilters.length > 0 &&
      this.enabledSourceFilterIds.size !== this.sourceFilters.length
    );
  }

  private carriesSearch = false;
  private readonly pageSearchCounters = new SvelteMap<symbol, () => PageSearchCount>();
  private readonly sourceFilterRegistrations = new SvelteMap<string, readonly SourceFilter[]>();

  /** Keeps the current search open through the next navigation, for “search everything”. */
  carrySearchToNextPage(): void {
    this.carriesSearch = true;
    this.searchShowsAll = false;
  }

  closeSearch(): void {
    this.searchOpen = false;
    this.searchQuery = "";
    this.searchShowsAll = false;
  }

  /** Ends the search a navigation leaves behind, unless it was carried to the new page. */
  finishSearchAfterNavigation(): void {
    if (!this.carriesSearch) this.closeSearch();
    this.carriesSearch = false;
  }

  hideAllSourceFilters(): void {
    this.enabledSourceFilterIds = new SvelteSet();
  }

  matchesSourceFilters(sources: readonly Source[]): boolean {
    return sources.length === 0 || sources.some((source) => this.showsSource(source));
  }

  openSearch(): void {
    this.searchOpen = true;
  }

  registerPageSearch(key: symbol, count: () => PageSearchCount): void {
    this.pageSearchCounters.set(key, count);
  }

  registerSourceFilters(owner: string, filters: readonly SourceFilter[]): void {
    this.sourceFilterRegistrations.set(owner, filters);
    this.rebuildSourceFilters();
  }

  resetSourceFilters(): void {
    this.enabledSourceFilterIds = new SvelteSet(this.sourceFilters.map((filter) => filter.id));
  }

  setSearchQuery(query: string): void {
    // Spaces alone aren't a search, so they can't keep filters paused with no notice on screen.
    this.searchQuery = query.trim() ? query : "";
    if (!this.searchQuery) this.searchShowsAll = false;
  }

  /** Whether the filters show `source`. An arrow, since projections take it as a callback. */
  readonly showsSource = (source: Source): boolean => {
    if (this.searchShowsAll || !this.isSourceFilterNarrowing) return true;
    const group = this.sourceFilters.find((filter) => filter.types.includes(source.type));
    return group === undefined || this.enabledSourceFilterIds.has(group.id);
  };

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

  unregisterPageSearch(key: symbol): void {
    this.pageSearchCounters.delete(key);
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
