import { afterEach, describe, expect, it } from "vitest";

import AlmanacContent from "#lib/components/almanac-content.svelte";
import MinesContent from "#lib/components/mines-content.svelte";
import MuseumContent from "#lib/components/museum-content.svelte";
import QuestsContent from "#lib/components/quests-content.svelte";
import RecipesContent from "#lib/components/recipes-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";
import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import type { ItemId, SpellId } from "#lib/types/tracker-data.js";

/** A filtered counter either shrinks below `bound` or the section shows the empty-filter message. */
function isFilteredTotalBelow(text: string, counter: RegExp, bound: number): boolean {
  const match = counter.exec(text);
  return match ? Number(match[2]) < bound : text.includes("No items match the current filters");
}

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

  it("limits almanac counters to the search scope", () => {
    userState.toggleAlmanacItem("axe_copper" as ItemId);
    userState.toggleAlmanacItem("copper_armor" as ItemId);
    userState.toggleShowCompleted();
    toolbarState.setSearchQuery("Copper Axe");

    const { text } = renderToFragmentWithFeedback(AlmanacContent, { props: { locale: "en" } });

    expect(text).toContain("Blacksmithing 1 / 1");
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

    expect(queries.queryByRole("button", { name: "Reveal spoiler" })).toBeNull();
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

    userState.setAvailabilityWindows(AVAILABILITY_WINDOWS);
    toolbarState.setSearchQuery(itemName);
    const unfiltered = renderToFragmentWithFeedback(MuseumContent, { props: { locale: "en" } });
    expect(unfiltered.text).toContain(itemName);

    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { text } = renderToFragmentWithFeedback(MuseumContent, { props: { locale: "en" } });
    expect(text).not.toContain(itemName);
  });

  it("reduces mine spell count when source groups are hidden", () => {
    const spellCount = Object.keys(trackerData.mines.spells).length;

    const unfiltered = renderToFragmentWithFeedback(MinesContent, { props: { locale: "en" } });
    expect(unfiltered.text).toContain(`Spells 0 / ${spellCount.toString()}`);

    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const { text } = renderToFragmentWithFeedback(MinesContent, { props: { locale: "en" } });
    expect(isFilteredTotalBelow(text, /Spells (\d+) \/ (\d+)/, spellCount)).toBe(true);
  });

  it("reduces fetch quest count when source groups are hidden", () => {
    userState.toggleShowSpoilers();

    const unfilteredBody = renderToFragmentWithFeedback(QuestsContent, {
      props: { locale: "en" },
    }).text;
    const unfilteredMatch = /Fetch Quests (\d+) \/ (\d+)/.exec(unfilteredBody);
    if (!unfilteredMatch) throw new Error("Expected Fetch Quests counter in unfiltered render");
    const unfilteredTotal = Number(unfilteredMatch[2]);

    toolbarState.registerSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    const filteredBody = renderToFragmentWithFeedback(QuestsContent, {
      props: { locale: "en" },
    }).text;
    expect(isFilteredTotalBelow(filteredBody, /Fetch Quests (\d+) \/ (\d+)/, unfilteredTotal)).toBe(
      true,
    );
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

    userState.setAvailabilityWindows(AVAILABILITY_WINDOWS);
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
