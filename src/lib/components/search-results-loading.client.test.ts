import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchResults from "#lib/components/search-results.svelte";
import { LOCALIZED_CATEGORIES } from "#lib/data/names.js";

import type * as NamesModule from "#lib/data/names.js";

/**
 * The client setup preloads every chunk, so the real `hasNames` would report ready at once.
 * Stubbing the two loading entry points lets the test hold the load open and observe the gate.
 */
const names = vi.hoisted(() => ({
  hasNames: vi.fn<() => boolean>(() => false),
  loadNames: vi.fn<() => Promise<void>>(),
}));

vi.mock("#lib/data/names.js", async (importOriginal) => ({
  ...(await importOriginal<typeof NamesModule>()),
  hasNames: names.hasNames,
  loadNames: names.loadNames,
}));

describe("SearchResults chunk loading", () => {
  afterEach(() => {
    names.hasNames.mockReset().mockReturnValue(false);
    names.loadNames.mockReset();
  });

  it("fetches every category for the locale and English on open, and searches once they land", async () => {
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
      expect(names.loadNames).toHaveBeenCalledWith("en", LOCALIZED_CATEGORIES);
    });
    expect(screen.queryAllByRole("button", { name: /カブ/ })).toHaveLength(0);

    release();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /カブ/ }).length).toBeGreaterThan(0);
    });
  });

  it("shows a retry action on failure, and recovers once the retry succeeds", async () => {
    names.loadNames.mockRejectedValueOnce(new Error("chunk fetch failed"));
    names.loadNames.mockRejectedValueOnce(new Error("chunk fetch failed"));
    names.loadNames.mockResolvedValue(undefined);

    render(SearchResults, { locale: "ja", query: "カブ" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t load search results.");

    await fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /カブ/ }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a stale rejection once a locale change has superseded it", async () => {
    const pending: { reject: (error: Error) => void; resolve: () => void }[] = [];
    names.loadNames.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          pending.push({ reject, resolve });
        }),
    );

    const view = render(SearchResults, { locale: "ja", query: "カブ" });
    await waitFor(() => {
      expect(pending).toHaveLength(2);
    });
    const [firstJa] = pending;

    // A locale change before the first attempt settles must cancel it: its eventual rejection
    // must not surface an error for the load that superseded it.
    await view.rerender({ locale: "fr", query: "カブ" });
    await waitFor(() => {
      expect(pending).toHaveLength(4);
    });
    firstJa.reject(new Error("stale rejection"));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    pending.slice(2).forEach(({ resolve }) => {
      resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText("Loading search…")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reloads names when the locale changes", async () => {
    const pending: { resolve: () => void }[] = [];
    names.loadNames.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.push({ resolve });
        }),
    );

    const view = render(SearchResults, { locale: "ja", query: "カブ" });
    await waitFor(() => {
      expect(pending).toHaveLength(2);
    });
    pending.forEach(({ resolve }) => {
      resolve();
    });
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /カブ/ }).length).toBeGreaterThan(0);
    });

    names.loadNames.mockClear();
    await view.rerender({ locale: "fr", query: "カブ" });

    expect(screen.getByRole("status")).toHaveTextContent("Loading search");
    expect(names.loadNames).toHaveBeenCalledWith("fr", LOCALIZED_CATEGORIES);
    expect(names.loadNames).toHaveBeenCalledWith("en", LOCALIZED_CATEGORIES);

    pending.slice(2).forEach(({ resolve }) => {
      resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText("Loading search…")).not.toBeInTheDocument();
    });
  });
});
