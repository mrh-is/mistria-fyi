import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchResults from "#lib/components/search-results.svelte";
import { INITIAL_ROW_BUDGET } from "#lib/controllers/row-reveal.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import type { SearchResult } from "#lib/engine/search.js";

const fixtures = vi.hoisted(() => ({ rows: [] as SearchResult[] }));
vi.mock("#lib/engine/search.js", () => ({
  searchAllCategories: (query: string) => fixtures.rows.filter((row) => row.name.includes(query)),
}));

let frames: FrameRequestCallback[];

async function finishReveal(): Promise<void> {
  while (frames.length > 0) {
    const queued = frames.splice(0);
    for (const frame of queued) frame(performance.now());
    // oxlint-disable-next-line no-await-in-loop -- Flush each frame before running its successor.
    await tick();
  }
}

describe("SearchResults progressive reveal", () => {
  beforeEach(() => {
    frames = [];
    fixtures.rows = Array.from({ length: 120 }, (_, index) => ({
      available: true,
      category: "animals",
      completed: false,
      id: `fixture-${index}`,
      name: `Animal ${index}`,
    }));
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
      frames.push(frame);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  it("shows the total immediately and reveals every match over frames", async () => {
    const view = renderWithFeedback(SearchResults, { locale: "en", query: "Animal" });
    await tick();
    expect(view.container.querySelector(".search-results__count")).toHaveTextContent("120");
    expect(view.container.querySelectorAll(".search-result")).toHaveLength(INITIAL_ROW_BUDGET);
    expect(view.container.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(view.container.querySelector("[data-search-result-reserve]")).not.toBeNull();

    await finishReveal();

    expect(view.container.querySelectorAll(".search-result")).toHaveLength(120);
    expect(view.getByText("Animal 119")).toBeInTheDocument();
    expect(view.container.querySelector("[aria-busy=true]")).toBeNull();
    expect(view.container.querySelector("[data-search-result-reserve]")).toBeNull();
  });

  it("replaces a pending query, then reveals all matches when widened again", async () => {
    const view = renderWithFeedback(SearchResults, { locale: "en", query: "Animal" });
    await tick();
    await view.rerender({ query: "Animal 119" });
    expect(view.container.querySelectorAll(".search-result")).toHaveLength(1);
    expect(view.getByText("Animal 119")).toBeInTheDocument();
    await view.rerender({ query: "Animal" });
    await finishReveal();
    expect(view.container.querySelectorAll(".search-result")).toHaveLength(120);
  });

  it("clears pending rows for an empty result and recovers on a new query", async () => {
    const view = renderWithFeedback(SearchResults, { locale: "en", query: "Animal" });
    await tick();
    await view.rerender({ query: "no match" });
    await finishReveal();
    expect(view.container.querySelectorAll(".search-result")).toHaveLength(0);
    expect(
      view.getByText("No items found", { selector: ".search-results__empty" }),
    ).toBeInTheDocument();
    expect(view.container.querySelector("[aria-busy=true]")).toBeNull();
    await view.rerender({ query: "Animal" });
    await finishReveal();
    expect(view.container.querySelectorAll(".search-result")).toHaveLength(120);
  });
});
