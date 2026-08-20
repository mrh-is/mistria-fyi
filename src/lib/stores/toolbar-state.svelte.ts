import { SvelteSet } from "svelte/reactivity";

import type { Component } from "svelte";

import type { Source } from "$lib/types/acquisition";

export interface SourceFilter {
  icon: Component;
  label: string;
  types: Source["type"][];
}

class ToolbarState {
  activeSourceLabels = $state<SvelteSet<string>>(new SvelteSet());
  recipeSourceFilters = $state<SourceFilter[]>([]);

  searchOpen = $state(false);
  searchQuery = $state("");

  get sourceFilterActive(): boolean {
    return (
      this.recipeSourceFilters.length > 0 &&
      this.activeSourceLabels.size !== this.recipeSourceFilters.length
    );
  }

  clearSourceFilter() {
    this.activeSourceLabels = new SvelteSet(this.recipeSourceFilters.map((f) => f.label));
  }

  closeSearch() {
    this.searchOpen = false;
    this.searchQuery = "";
  }

  hideAllSourceFilters() {
    this.activeSourceLabels = new SvelteSet();
  }

  openSearch() {
    this.searchOpen = true;
  }

  setRecipeSourceFilters(filters: SourceFilter[]) {
    this.recipeSourceFilters = filters;
    this.activeSourceLabels = new SvelteSet(filters.map((f) => f.label));
  }

  setSearch(query: string) {
    this.searchQuery = query;
  }

  showAllSourceFilters() {
    this.activeSourceLabels = new SvelteSet(this.recipeSourceFilters.map((f) => f.label));
  }

  toggleSourceFilter(filter: SourceFilter) {
    if (this.activeSourceLabels.has(filter.label)) {
      this.activeSourceLabels.delete(filter.label);
    } else {
      this.activeSourceLabels.add(filter.label);
    }
  }
}

export const toolbarState = new ToolbarState();
