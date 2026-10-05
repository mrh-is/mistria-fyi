import { SvelteMap, SvelteSet } from "svelte/reactivity";

import type { Component } from "svelte";

import type { Source } from "#lib/types/acquisition.js";

export interface SourceFilter {
  icon: Component;
  label: string;
  members: string[];
  types: Source["type"][];
}

export class ToolbarState {
  activeSourceLabels = $state<SvelteSet<string>>(new SvelteSet());
  searchOpen = $state(false);

  searchQuery = $state("");

  sourceFilters = $state<SourceFilter[]>([]);
  get sourceFilterActive(): boolean {
    return (
      this.sourceFilters.length > 0 && this.activeSourceLabels.size !== this.sourceFilters.length
    );
  }

  private sourceFilterRegistrations = new SvelteMap<string, SourceFilter[]>();

  closeSearch() {
    this.searchOpen = false;
    this.searchQuery = "";
  }

  hideAllSourceFilters() {
    this.activeSourceLabels = new SvelteSet();
  }

  matchesSourceFilters(sources: Source[]): boolean {
    if (!this.sourceFilterActive) return true;
    return (
      sources.length === 0 ||
      sources.some((source) => {
        const group = this.sourceFilters.find((filter) => filter.types.includes(source.type));
        return group === undefined || this.activeSourceLabels.has(group.label);
      })
    );
  }

  openSearch() {
    this.searchOpen = true;
  }

  removeSourceFilters(owner: string) {
    this.sourceFilterRegistrations.delete(owner);
    this.rebuildSourceFilters();
  }

  resetSourceFilters() {
    this.activeSourceLabels = new SvelteSet(this.sourceFilters.map((filter) => filter.label));
  }

  setSearch(query: string) {
    this.searchQuery = query;
  }

  setSourceFilters(owner: string, filters: SourceFilter[]) {
    this.sourceFilterRegistrations.set(owner, filters);
    this.rebuildSourceFilters();
  }

  showAllSourceFilters() {
    this.resetSourceFilters();
  }

  toggleSourceFilter(filter: SourceFilter) {
    if (this.activeSourceLabels.has(filter.label)) {
      this.activeSourceLabels.delete(filter.label);
    } else {
      this.activeSourceLabels.add(filter.label);
    }
  }

  private rebuildSourceFilters() {
    const filtersByLabel = new SvelteMap<string, SourceFilter>();
    for (const filters of this.sourceFilterRegistrations.values()) {
      for (const filter of filters) filtersByLabel.set(filter.label, filter);
    }
    const nextFilters = [...filtersByLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
    const currentLabels = this.sourceFilters.map(({ label }) => label).join("\0");
    const nextLabels = nextFilters.map(({ label }) => label).join("\0");
    if (currentLabels !== nextLabels) {
      this.sourceFilters = nextFilters;
      this.resetSourceFilters();
    }
  }
}

export const toolbarState = new ToolbarState();
