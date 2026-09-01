import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import AlmanacContent from "$lib/components/almanac-content.svelte";
import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
import MinesContent from "$lib/components/mines-content.svelte";
import MuseumContent from "$lib/components/museum-content.svelte";
import QuestsContent from "$lib/components/quests-content.svelte";
import RecipesContent from "$lib/components/recipes-content.svelte";
import { trackerData } from "$lib/data/index.js";
import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { ItemId, SpellId } from "$lib/types/tracker-data.js";

function renderedText(body: string): string {
  return body
    .replaceAll(/<!--.*?-->/gs, "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  userState.resetAll();
  toolbarState.closeSearch();
  toolbarState.removeSourceFilters("test");
});

describe("subsection counters", () => {
  it("counts completed spells when completed rows are hidden", () => {
    const spellIds = Object.keys(trackerData.mines.spells) as SpellId[];
    userState.toggleSpell(spellIds[0]);

    const { body } = render(MinesContent, { props: {} });

    expect(renderedText(body)).toContain(`Spells 1/${spellIds.length}`);
  });

  it("keeps the spells section when every completed row is hidden", () => {
    for (const spellId of Object.keys(trackerData.mines.spells) as SpellId[]) {
      userState.toggleSpell(spellId);
    }

    const { body } = render(MinesContent, { props: {} });

    const spellCount = Object.keys(trackerData.mines.spells).length;
    expect(renderedText(body)).toContain(
      `Spells ${spellCount.toString()}/${spellCount.toString()}`,
    );
  });

  it("limits almanac counters to the search scope", () => {
    userState.toggleAlmanacItem("axe_copper" as ItemId);
    userState.toggleAlmanacItem("copper_armor" as ItemId);
    userState.toggleShowCompleted();
    toolbarState.setSearch("Copper Axe");

    const { body } = render(AlmanacContent, { props: {} });

    expect(renderedText(body)).toContain("Blacksmithing 1/1");
  });

  it("hides recipes whose covered sources all belong to hidden groups", () => {
    const coveredTypes = new Set(SOURCE_FILTERS.flatMap(({ types }) => types));
    const hiddenRecipe = Object.values(trackerData.recipes).find(({ sources }) =>
      sources.every(({ type }) => coveredTypes.has(type)),
    );
    if (!hiddenRecipe) throw new Error("Expected a recipe with covered source types");

    toolbarState.setSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { body } = render(RecipesContent, { props: {} });

    expect(renderedText(body)).not.toContain(hiddenRecipe.name);
  });

  it("hides museum items whose covered sources all belong to hidden groups", () => {
    const coveredTypes = new Set(SOURCE_FILTERS.flatMap(({ types }) => types));
    const museumItems = Object.values(trackerData.museum).flatMap(({ sets }) =>
      Object.values(sets).flatMap(({ items }) => items),
    );
    const hiddenItem = museumItems.find((itemId) => {
      const item = trackerData.items[itemId];
      return item.sources.every(({ type }) => coveredTypes.has(type));
    });
    if (!hiddenItem) throw new Error("Expected a museum item with covered source types");
    const itemName = trackerData.items[hiddenItem].name;

    userState.setAvailabilityMode("everything");
    toolbarState.setSearch(itemName);
    const unfiltered = render(MuseumContent, { props: {} });
    expect(renderedText(unfiltered.body)).toContain(itemName);

    toolbarState.setSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { body } = render(MuseumContent, { props: {} });
    expect(renderedText(body)).not.toContain(itemName);
  });

  it("reduces mine spell count when source groups are hidden", () => {
    const spellCount = Object.keys(trackerData.mines.spells).length;

    const unfiltered = render(MinesContent, { props: {} });
    expect(renderedText(unfiltered.body)).toContain(`Spells 0/${spellCount.toString()}`);

    toolbarState.setSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { body } = render(MinesContent, { props: {} });
    const match = /Spells (\d+)\/(\d+)/.exec(renderedText(body));
    if (match) {
      expect(Number(match[2])).toBeLessThan(spellCount);
    } else {
      expect(renderedText(body)).toContain("No items match the current filters");
    }
  });

  it("reduces fetch quest count when source groups are hidden", () => {
    userState.toggleShowSpoilers();

    const unfilteredBody = renderedText(render(QuestsContent, { props: {} }).body);
    const unfilteredMatch = /Fetch Quests (\d+)\/(\d+)/.exec(unfilteredBody);
    if (!unfilteredMatch) throw new Error("Expected Fetch Quests counter in unfiltered render");
    const unfilteredTotal = Number(unfilteredMatch[2]);

    toolbarState.setSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const filteredBody = renderedText(render(QuestsContent, { props: {} }).body);
    const filteredMatch = /Fetch Quests (\d+)\/(\d+)/.exec(filteredBody);

    if (filteredMatch) {
      expect(Number(filteredMatch[2])).toBeLessThan(unfilteredTotal);
    } else {
      expect(filteredBody).toContain("No items match the current filters");
    }
  });

  it("hides almanac rows whose covered sources all belong to hidden groups", () => {
    const coveredTypes = new Set(SOURCE_FILTERS.flatMap(({ types }) => types));
    const entries = Object.values(trackerData.almanac).flatMap(({ items }) => items);
    const hiddenEntry = entries.find((entry) => {
      const nameIsUnique = entries.filter(({ name }) => name === entry.name).length === 1;
      const sources = entry.itemIds.flatMap((itemId) => trackerData.items[itemId].sources);
      return nameIsUnique && sources.every(({ type }) => coveredTypes.has(type));
    });
    if (!hiddenEntry) throw new Error("Expected an almanac row with covered source types");

    userState.setAvailabilityMode("everything");
    toolbarState.setSearch(hiddenEntry.name);
    const unfiltered = render(AlmanacContent, { props: {} });
    expect(renderedText(unfiltered.body)).toContain(hiddenEntry.name);

    toolbarState.setSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { body } = render(AlmanacContent, { props: {} });

    expect(renderedText(body)).not.toContain(hiddenEntry.name);
  });
});
