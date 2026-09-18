import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import SearchResults from "$lib/components/search-results.svelte";
import { LOCALIZED_CATEGORIES } from "$lib/data/names.js";

import type * as NamesModule from "$lib/data/names.js";

/**
 * The client setup preloads every chunk, so the real `hasNames` would report ready at once.
 * Stubbing the two loading entry points lets the test hold the load open and observe the gate.
 */
const names = vi.hoisted(() => ({
  hasNames: vi.fn<() => boolean>(() => false),
  loadNames: vi.fn<() => Promise<void>>(),
}));

vi.mock("$lib/data/names.js", async (importOriginal) => ({
  ...(await importOriginal<typeof NamesModule>()),
  hasNames: names.hasNames,
  loadNames: names.loadNames,
}));

describe("SearchResults chunk loading", () => {
  it("fetches every category for the locale on open, and searches once they land", async () => {
    let release = (): void => undefined;
    names.loadNames.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    render(SearchResults, { locale: "ja", query: "カブ" });

    expect(screen.getByRole("status")).toHaveTextContent("Loading search");
    await waitFor(() => {
      expect(names.loadNames).toHaveBeenCalledWith("ja", LOCALIZED_CATEGORIES);
    });
    expect(screen.queryAllByRole("button", { name: /カブ/ })).toHaveLength(0);

    release();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /カブ/ }).length).toBeGreaterThan(0);
    });
  });
});
