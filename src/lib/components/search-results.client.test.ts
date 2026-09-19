import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchResults from "$lib/components/search-results.svelte";
import { trackerData, trackerIndex } from "$lib/data/index.js";
import { getName } from "$lib/data/names.js";
import { searchItems } from "$lib/engine/search.js";
import { userState } from "$lib/stores/user-state.svelte.js";
import { recordEntries } from "$lib/utils.js";

import type { ItemId } from "$lib/types/tracker-data.js";

const showUndoToast = vi.hoisted(() => vi.fn());

vi.mock("$lib/utils/undo-toast.js", () => ({ showUndoToast }));

afterEach(() => {
  userState.resetAll();
  showUndoToast.mockReset();
});

describe("SearchResults completion dispatch", () => {
  it("toggles and undoes a museum result only in completed.museum", async () => {
    const { id, name } = museumOnlyFixture();
    const animalKeys = Object.keys(userState.state.completed.animalCosmetics);

    render(SearchResults, { locale: "en", query: name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${name}` }));

    expect(userState.state.completed.museum.has(id)).toBe(true);
    expect(userState.state.completed.almanac.has(id)).toBe(false);
    expect(Object.keys(userState.state.completed.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.completed.museum.has(id)).toBe(false);
  });

  it("toggles and undoes the almanac row of an overlapping item only in completed.almanac", async () => {
    const { id, name } = overlappingFixture();

    render(SearchResults, { locale: "en", query: name });
    await fireEvent.click(rowToggle("Almanac", name));

    expect(userState.state.completed.almanac.has(id)).toBe(true);
    expect(userState.state.completed.museum.has(id)).toBe(false);
    undoLastToggle();
    expect(userState.state.completed.almanac.has(id)).toBe(false);
    expect(userState.state.completed.museum.has(id)).toBe(false);
  });

  it("toggles and undoes the museum row of an overlapping item only in completed.museum", async () => {
    const { id, name } = overlappingFixture();

    render(SearchResults, { locale: "en", query: name });
    await fireEvent.click(rowToggle("Museum", name));

    expect(userState.state.completed.museum.has(id)).toBe(true);
    expect(userState.state.completed.almanac.has(id)).toBe(false);
    undoLastToggle();
    expect(userState.state.completed.museum.has(id)).toBe(false);
    expect(userState.state.completed.almanac.has(id)).toBe(false);
  });

  it("toggles and undoes a pet cosmetic without creating a bogus animal key", async () => {
    const [id] = recordEntries(trackerData.pets.cosmetics)[0];
    const animalKeys = Object.keys(userState.state.completed.animalCosmetics);

    const name = getName("pets/cosmetic_sets", id, "en");
    render(SearchResults, { locale: "en", query: name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${name}` }));

    expect(userState.state.completed.petCosmetics.has(id)).toBe(true);
    expect(Object.keys(userState.state.completed.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.completed.petCosmetics.has(id)).toBe(false);
  });

  it("toggles and undoes a pet skin without creating a bogus animal key", async () => {
    const [id] = recordEntries(trackerData.pets.skins)[0];
    const animalKeys = Object.keys(userState.state.completed.animalCosmetics);
    const name = getName("pets/skins", id, "en");

    render(SearchResults, { locale: "en", query: name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${name}` }));

    expect(userState.state.completed.petSkins.has(id)).toBe(true);
    expect(Object.keys(userState.state.completed.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.completed.petSkins.has(id)).toBe(false);
  });
});

function museumOnlyFixture(): { id: ItemId; name: string } {
  const canonicalIds = new Set(trackerIndex.almanacEntries.map((entry) => entry.itemIds[0]));
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const id of set.items) {
        if (canonicalIds.has(id)) continue;
        const name = getName("items", id, "en");
        const results = searchItems(
          name,
          userState.state.completed,
          userState.state.worldState,
          userState.progressionState,
          "en",
        );
        if (results.some((result) => result.category === "museum" && result.id === id)) {
          return { id, name };
        }
      }
    }
  }
  throw new Error("Expected tracker data to contain a searchable museum-only item");
}

/** An item that is both a canonical almanac entry and a museum set member. */
function overlappingFixture(): { id: ItemId; name: string } {
  const canonicalIds = new Set(trackerIndex.almanacEntries.map((entry) => entry.itemIds[0]));
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const id of set.items) {
        if (!canonicalIds.has(id)) continue;
        const name = getName("items", id, "en");
        const results = searchItems(
          name,
          userState.state.completed,
          userState.state.worldState,
          userState.progressionState,
          "en",
        );
        if (results.some((result) => result.category === "almanac" && result.id === id)) {
          return { id, name };
        }
      }
    }
  }
  throw new Error("Expected tracker data to contain an item in both the almanac and the museum");
}

/** The toggle button in the search row whose category badge reads `category`. */
function rowToggle(category: string, name: string): HTMLElement {
  const toggleName = `Check ${name}`;
  for (const badge of screen.getAllByText(category, { selector: ".search-result__category" })) {
    const row = badge.closest<HTMLElement>(".search-result");
    const toggle = row && within(row).queryByRole("button", { name: toggleName });
    if (toggle) return toggle;
  }
  throw new Error(`Expected a ${category} search row with a "${toggleName}" toggle`);
}

function undoLastToggle(): void {
  expect(showUndoToast).toHaveBeenCalledOnce();
  const undo = showUndoToast.mock.calls[0]?.[2] as (() => void) | undefined;
  expect(undo).toBeTypeOf("function");
  undo?.();
}
