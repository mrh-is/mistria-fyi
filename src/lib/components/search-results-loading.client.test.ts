import { fireEvent, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchResults from "#lib/components/search-results.svelte";
import { LOCALIZED_CATEGORIES } from "#lib/data/names.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import type * as NamesModule from "#lib/data/names.js";

/**
 * The setup preloads English and Japanese; this suite also needs French data after its mocked
 * loads resolve. Stubbing the loading entry points lets tests hold them open and observe the gate.
 */
const names = vi.hoisted(() => ({
  hasNames: vi.fn<() => boolean>(() => false),
  loadNames: vi.fn<() => Promise<void>>(),
}));

vi.mock("#lib/data/names.js", async (importOriginal) => {
  const original = await importOriginal<typeof NamesModule>();
  await original.loadNames("fr", original.LOCALIZED_CATEGORIES);
  return { ...original, hasNames: names.hasNames, loadNames: names.loadNames };
});

interface PendingLoad {
  reject: (error: Error) => void;
  resolve: () => void;
}

/** A `loadNames` call that stays open until the test settles it through `pending`. */
function holdLoad(pending: PendingLoad[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    pending.push({ reject, resolve });
  });
}

describe("SearchResults chunk loading", () => {
  afterEach(() => {
    names.hasNames.mockReset().mockReturnValue(false);
    names.loadNames.mockReset();
  });

  it("fetches every category for the locale and English on open, and searches once they land", async () => {
    let release: (() => void) | undefined;
    names.loadNames.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    renderWithFeedback(SearchResults, { locale: "ja", query: "カブ" });

    expect(screen.getByRole("status")).toHaveTextContent("Loading search");
    await waitFor(() => {
      expect(names.loadNames).toHaveBeenCalledWith("ja", LOCALIZED_CATEGORIES);
      expect(names.loadNames).toHaveBeenCalledWith("en", LOCALIZED_CATEGORIES);
    });
    expect(screen.queryAllByRole("button", { name: /カブ/ })).toHaveLength(0);

    release?.();
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /カブ/ }).length).toBeGreaterThan(0);
    });
  });

  it("shows a retry action on failure, and recovers once the retry succeeds", async () => {
    names.loadNames.mockRejectedValueOnce(new Error("chunk fetch failed"));
    names.loadNames.mockRejectedValueOnce(new Error("chunk fetch failed"));
    names.loadNames.mockResolvedValue(undefined);

    renderWithFeedback(SearchResults, { locale: "ja", query: "カブ" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t load search results.");

    await fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /カブ/ }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a stale rejection once a locale change has superseded it", async () => {
    const pending: PendingLoad[] = [];
    names.loadNames.mockImplementation(() => holdLoad(pending));

    const view = renderWithFeedback(SearchResults, { locale: "ja", query: "カブ" });
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

    for (const { resolve } of pending.slice(2)) {
      resolve();
    }
    await waitFor(() => {
      expect(screen.queryByText("Loading search…")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reloads names when the locale changes", async () => {
    const pending: PendingLoad[] = [];
    names.loadNames.mockImplementation(() => holdLoad(pending));

    const view = renderWithFeedback(SearchResults, { locale: "ja", query: "カブ" });
    await waitFor(() => {
      expect(pending).toHaveLength(2);
    });
    for (const { resolve } of pending) {
      resolve();
    }
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /カブ/ }).length).toBeGreaterThan(0);
    });

    names.loadNames.mockClear();
    await view.rerender({ locale: "fr", query: "カブ" });

    expect(screen.getByRole("status")).toHaveTextContent("Loading search");
    expect(names.loadNames).toHaveBeenCalledWith("fr", LOCALIZED_CATEGORIES);
    expect(names.loadNames).toHaveBeenCalledWith("en", LOCALIZED_CATEGORIES);

    for (const { resolve } of pending.slice(2)) {
      resolve();
    }
    await waitFor(() => {
      expect(screen.queryByText("Loading search…")).not.toBeInTheDocument();
    });
  });
});
