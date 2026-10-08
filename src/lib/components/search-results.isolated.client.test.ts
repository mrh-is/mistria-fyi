import { fireEvent, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchResults from "#lib/components/search-results.svelte";
import { trackerData, trackerIndex } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { searchAllCategories } from "#lib/engine/search.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ItemId, QuestId, VillagerId } from "#lib/types/tracker-data.js";

const showUndoToast = vi.hoisted(() => vi.fn());
const showQuestToast = vi.hoisted(() => vi.fn());

vi.mock("#lib/effects/undo-toast.js", () => ({ showQuestToast, showUndoToast }));

afterEach(() => {
  userState.resetAll();
  showUndoToast.mockReset();
  showQuestToast.mockReset();
});

describe("SearchResults completion dispatch", () => {
  it("links a villager result to its record instead of toggling hearts", () => {
    const id = "adeline" as VillagerId;
    userState.setHeartLevel(id, 11);

    renderWithFeedback(SearchResults, { locale: "en", query: "Adeline" });
    const link = screen.getByRole("link", { name: "Adeline relationship level, 11 of 12" });

    expect(link).toHaveAttribute("href", expect.stringMatching(/\/villagers#villager-adeline$/));
    expect(screen.queryByRole("button", { name: "Check Adeline" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Uncheck Adeline" })).toBeNull();
    expect(userState.state.progress.heartLevels[id]).toBe(11);
  });

  it("reports a result under a stable category key, not its localized name", () => {
    const { name } = museumOnlyFixture();

    const { feedbackContext } = renderWithFeedback(SearchResults, { locale: "ja", query: name });

    const categories = [...feedbackContext.registrations.values()].map(({ category }) => category);
    expect(categories).toContain("museum-item");
    expect(categories.every((category) => /^[a-z]+(-[a-z]+)*$/u.test(category))).toBe(true);
  });

  it("toggles and undoes a museum result only in completed.museum", async () => {
    const { id, name } = museumOnlyFixture();
    const animalKeys = Object.keys(userState.state.progress.animalCosmetics);

    renderWithFeedback(SearchResults, { locale: "en", query: name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${name}` }));

    expect(userState.state.progress.museum.has(id)).toBe(true);
    expect(userState.state.progress.almanac.has(id)).toBe(false);
    expect(Object.keys(userState.state.progress.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.progress.museum.has(id)).toBe(false);
  });

  it("toggles and undoes the almanac row of an overlapping item only in completed.almanac", async () => {
    const { id, name } = overlappingFixture();

    renderWithFeedback(SearchResults, { locale: "en", query: name });
    await fireEvent.click(rowToggle("Almanac", name));

    expect(userState.state.progress.almanac.has(id)).toBe(true);
    expect(userState.state.progress.museum.has(id)).toBe(false);
    undoLastToggle();
    expect(userState.state.progress.almanac.has(id)).toBe(false);
    expect(userState.state.progress.museum.has(id)).toBe(false);
  });

  it("toggles and undoes the museum row of an overlapping item only in completed.museum", async () => {
    const { id, name } = overlappingFixture();

    renderWithFeedback(SearchResults, { locale: "en", query: name });
    await fireEvent.click(rowToggle("Museum", name));

    expect(userState.state.progress.museum.has(id)).toBe(true);
    expect(userState.state.progress.almanac.has(id)).toBe(false);
    undoLastToggle();
    expect(userState.state.progress.museum.has(id)).toBe(false);
    expect(userState.state.progress.almanac.has(id)).toBe(false);
  });

  it("toggles and undoes a pet cosmetic without creating a bogus animal key", async () => {
    const [id] = recordEntries(trackerData.pets.cosmetics)[0];
    const animalKeys = Object.keys(userState.state.progress.animalCosmetics);

    const name = getName("pets/cosmetic_sets", id, "en");
    renderWithFeedback(SearchResults, { locale: "en", query: name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${name}` }));

    expect(userState.state.progress.petCosmetics.has(id)).toBe(true);
    expect(Object.keys(userState.state.progress.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.progress.petCosmetics.has(id)).toBe(false);
  });

  it("toggles and undoes a pet skin without creating a bogus animal key", async () => {
    const [id] = recordEntries(trackerData.pets.skins)[0];
    const animalKeys = Object.keys(userState.state.progress.animalCosmetics);
    const name = getName("pets/skins", id, "en");

    renderWithFeedback(SearchResults, { locale: "en", query: name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${name}` }));

    expect(userState.state.progress.petSkins.has(id)).toBe(true);
    expect(Object.keys(userState.state.progress.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.progress.petSkins.has(id)).toBe(false);
  });

  it("advances a quest result through the shared quest toast and undoes it", async () => {
    const { id, name } = questFixture();

    renderWithFeedback(SearchResults, { locale: "en", query: name });
    await fireEvent.click(rowToggle("Quests", name));

    const nextState = userState.state.progress.questStates[id];
    expect(nextState).toBeDefined();
    expect(showUndoToast).not.toHaveBeenCalled();
    expect(showQuestToast).toHaveBeenCalledExactlyOnceWith(
      name,
      nextState,
      expect.any(Array),
      "en",
      expect.any(Function),
    );
    const undo = showQuestToast.mock.calls[0]?.[4] as () => void;
    undo();
    expect(userState.state.progress.questStates[id] ?? "none").toBe("none");
  });
});

/** A quest whose name finds its own search row. */
function questFixture(): { id: QuestId; name: string } {
  for (const byType of Object.values(trackerData.quests)) {
    for (const id of Object.keys(byType) as QuestId[]) {
      const name = getName("quests", id, "en");
      const results = searchAllCategories(
        name,
        userState.state.progress,
        userState.state.worldState,
        userState.progressionState,
        "en",
      );
      if (results.some((result) => result.category === "quests" && result.id === id)) {
        return { id, name };
      }
    }
  }
  throw new Error("Expected tracker data to contain a searchable quest");
}

function museumOnlyFixture(): { id: ItemId; name: string } {
  const canonicalIds = new Set(trackerIndex.almanacEntries.map((entry) => entry.itemIds[0]));
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const id of set.items) {
        if (canonicalIds.has(id)) continue;
        const name = getName("items", id, "en");
        const results = searchAllCategories(
          name,
          userState.state.progress,
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
        const results = searchAllCategories(
          name,
          userState.state.progress,
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
  expect(showUndoToast).toHaveBeenCalledTimes(1);
  const undo = showUndoToast.mock.calls[0]?.[2] as (() => void) | undefined;
  expect(undo).toBeTypeOf("function");
  undo?.();
}
