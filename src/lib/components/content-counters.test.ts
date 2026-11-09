import { afterEach, describe, expect, it } from "vitest";

import AlmanacContent from "#lib/components/almanac-content.svelte";
import MinesContent from "#lib/components/mines-content.svelte";
import MuseumContent from "#lib/components/museum-content.svelte";
import RecipesContent from "#lib/components/recipes-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { getCategoryProgress } from "#lib/engine/categories.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import * as m from "#lib/paraglide/messages.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";

import type { ItemId, SpellId } from "#lib/types/tracker-data.js";

afterEach(() => {
  userState.resetAll();
  toolbarState.closeSearch();
  toolbarState.unregisterSourceFilters("test");
});

describe("subsection counters", () => {
  it("counts completed spells when completed rows are hidden", () => {
    const spellIds = Object.keys(trackerData.mines.spells) as SpellId[];
    userState.toggleSpell(spellIds[0]);

    const { text } = renderToFragmentWithFeedback(MinesContent, { props: { locale: "en" } });

    expect(text).toContain(`Spells 1 / ${spellIds.length}`);
  });

  it("keeps the spells section when every completed row is hidden", () => {
    for (const spellId of Object.keys(trackerData.mines.spells) as SpellId[]) {
      userState.toggleSpell(spellId);
    }

    const { text } = renderToFragmentWithFeedback(MinesContent, { props: { locale: "en" } });

    const spellCount = Object.keys(trackerData.mines.spells).length;
    expect(text).toContain(`Spells ${spellCount.toString()} / ${spellCount.toString()}`);
  });

  it("keeps the full section total during a search", () => {
    userState.toggleAlmanacItem("axe_copper" as ItemId);
    userState.toggleAlmanacItem("copper_armor" as ItemId);
    toolbarState.setSearchQuery("Copper Axe");

    const { text } = renderToFragmentWithFeedback(AlmanacContent, { props: { locale: "en" } });

    expect(text).toMatch(/Blacksmithing 2 \/ \d{2,}/u);
  });

  it("does not return spoilered almanac rows from search", () => {
    const hiddenEntry = Object.values(trackerData.almanac)
      .flatMap(({ items }) => items)
      .find(({ itemIds }) => {
        const item = trackerData.items[itemIds[0]];
        return !isConditionVisible(item.visibility, userState.progressionState);
      });
    if (!hiddenEntry) throw new Error("Expected a spoilered almanac entry");

    toolbarState.setSearchQuery(getName("items", hiddenEntry.itemIds[0], "en"));
    const { queries } = renderToFragmentWithFeedback(AlmanacContent, { props: { locale: "en" } });

    expect(queries.queryByRole("button", { name: m.spoiler_reveal_aria() })).toBeNull();
  });

  it("hides recipes whose covered sources all belong to hidden groups", () => {
    const coveredTypes = new Set(SOURCE_FILTERS.flatMap(({ types }) => types));
    const hiddenRecipe = Object.entries(trackerData.recipes).find(([, { sources }]) =>
      sources.every(({ type }) => coveredTypes.has(type)),
    );
    if (!hiddenRecipe) throw new Error("Expected a recipe with covered source types");
    const hiddenRecipeName = getName("recipes", hiddenRecipe[0] as never, "en");

    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { text } = renderToFragmentWithFeedback(RecipesContent, { props: { locale: "en" } });

    expect(text).not.toContain(hiddenRecipeName);
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
    const itemName = getName("items", hiddenItem, "en");
    toolbarState.setSearchQuery(itemName);
    const unfiltered = renderToFragmentWithFeedback(MuseumContent, { props: { locale: "en" } });
    expect(unfiltered.text).toContain(itemName);

    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { text } = renderToFragmentWithFeedback(MuseumContent, { props: { locale: "en" } });
    expect(text).not.toContain(itemName);
  });

  it("drops spells from the page, not from the total, when source groups are hidden", () => {
    const spellCount = Object.keys(trackerData.mines.spells).length;

    const unfiltered = renderToFragmentWithFeedback(MinesContent, { props: { locale: "en" } });
    expect(unfiltered.text).toContain(`Spells 0 / ${spellCount.toString()}`);

    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const total = getCategoryProgress("mines", userState.progressContext, {
      showsSource: toolbarState.showsSource,
    }).total;
    expect(total).toBe(getCategoryProgress("mines", userState.progressContext).total);
  });

  it("narrows the quests header with the sources its sections filter by", () => {
    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    const unfiltered = getCategoryProgress("quests", userState.progressContext, {
      showsSource: toolbarState.showsSource,
    });
    toolbarState.hideAllSourceFilters();

    const filtered = getCategoryProgress("quests", userState.progressContext, {
      showsSource: toolbarState.showsSource,
    });

    expect(filtered.todo).toBeLessThan(unfiltered.todo);
    expect(filtered.total).toBe(unfiltered.total);
  });

  it("hides almanac rows whose covered sources all belong to hidden groups", () => {
    const coveredTypes = new Set(SOURCE_FILTERS.flatMap(({ types }) => types));
    const entries = Object.values(trackerData.almanac).flatMap(({ items }) => items);
    const hiddenEntry = entries.find((entry) => {
      const entryName = getName("items", entry.itemIds[0], "en");
      const nameIsUnique =
        entries.filter((candidate) => getName("items", candidate.itemIds[0], "en") === entryName)
          .length === 1;
      const sources = entry.itemIds.flatMap((itemId) => trackerData.items[itemId].sources);
      return nameIsUnique && sources.every(({ type }) => coveredTypes.has(type));
    });
    if (!hiddenEntry) throw new Error("Expected an almanac row with covered source types");
    const hiddenEntryName = getName("items", hiddenEntry.itemIds[0], "en");
    toolbarState.setSearchQuery(hiddenEntryName);
    const unfiltered = renderToFragmentWithFeedback(AlmanacContent, { props: { locale: "en" } });
    expect(unfiltered.text).toContain(hiddenEntryName);

    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { text } = renderToFragmentWithFeedback(AlmanacContent, { props: { locale: "en" } });

    expect(text).not.toContain(hiddenEntryName);
  });
});
