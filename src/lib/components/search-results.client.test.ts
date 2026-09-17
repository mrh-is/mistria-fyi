import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchResults from "$lib/components/search-results.svelte";
import { trackerData } from "$lib/data/index.js";
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

  it("toggles and undoes a pet cosmetic without creating a bogus animal key", async () => {
    const [id, cosmetic] = recordEntries(trackerData.pets.cosmetics)[0];
    const animalKeys = Object.keys(userState.state.completed.animalCosmetics);

    render(SearchResults, { locale: "en", query: cosmetic.name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${cosmetic.name}` }));

    expect(userState.state.completed.petCosmetics.has(id)).toBe(true);
    expect(Object.keys(userState.state.completed.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.completed.petCosmetics.has(id)).toBe(false);
  });

  it("toggles and undoes a pet skin without creating a bogus animal key", async () => {
    const [id, skin] = recordEntries(trackerData.pets.skins)[0];
    const animalKeys = Object.keys(userState.state.completed.animalCosmetics);

    render(SearchResults, { locale: "en", query: skin.name });
    await fireEvent.click(screen.getByRole("button", { name: `Check ${skin.name}` }));

    expect(userState.state.completed.petSkins.has(id)).toBe(true);
    expect(Object.keys(userState.state.completed.animalCosmetics)).toEqual(animalKeys);
    undoLastToggle();
    expect(userState.state.completed.petSkins.has(id)).toBe(false);
  });
});

function museumOnlyFixture(): { id: ItemId; name: string } {
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const id of set.items) {
        const name = trackerData.items[id].name;
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

function undoLastToggle(): void {
  expect(showUndoToast).toHaveBeenCalledOnce();
  const undo = showUndoToast.mock.calls[0]?.[2] as (() => void) | undefined;
  expect(undo).toBeTypeOf("function");
  undo?.();
}
