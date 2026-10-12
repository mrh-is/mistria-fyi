import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { MAX_COMPRESSED_SIZE } from "#lib/engine/parse-sav.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordKeys } from "#lib/utils/record.js";

import ImportCard from "./import-card.svelte";

afterEach(() => {
  userState.resetAll();
});

async function importFiles(files: File[]) {
  render(ImportCard, { open: true });
  await fireEvent.change(screen.getByLabelText("Choose save files to import"), {
    target: { files },
  });
}

describe("save import", () => {
  it("announces no new data on a repeated import after a successful source-file summary", async () => {
    render(ImportCard, { open: true });
    const input = screen.getByLabelText("Choose save files to import");
    const files = [new File([JSON.stringify({ items_acquired: [] })], "player.json")];

    await fireEvent.change(input, { target: { files } });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Import completed.");
    });
    expect(screen.getByText(/Imported from player.json/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    await fireEvent.change(input, { target: { files } });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("No new data to import.");
    });
    expect(screen.getByText("No new data to import", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a successful source-file summary and warning count", async () => {
    await importFiles([
      new File(
        [JSON.stringify({ items_acquired: ["animated_waterfall_v2"], perks: ["unknown_perk"] })],
        "player.json",
      ),
    ]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Import completed.");
    });
    expect(screen.getByText(/Imported from player.json/)).toBeInTheDocument();
    expect(screen.getByText("1 warnings", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("imports extracted JSON files and lists each warning", async () => {
    const cosmeticId = recordKeys(trackerData.cosmetics)[0];
    const player = new File(
      [JSON.stringify({ cosmetic_unlocks: [cosmeticId, "not_a_cosmetic", "not_a_cosmetic"] })],
      "player.json",
    );

    await importFiles([player, new File(["{"], "gamedata.json")]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Import completed.");
    });
    expect(userState.state.progress.cosmetics.has(cosmeticId)).toBe(true);
    // The duplicate warnings also exercise the index-keyed list, which a text key would break.
    expect(
      screen.getAllByText("player.cosmetic_unlocks: unrecognized ID not_a_cosmetic; skipped"),
    ).toHaveLength(2);
    expect(screen.getByText("gamedata.json isn’t valid JSON; skipped")).toBeInTheDocument();
  });

  it("reports unparseable JSON files and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportBackup();

    await importFiles([new File(["{"], "player.json")]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "None of the selected save files could be read.",
      );
    });
    expect(
      within(screen.getByRole("alert")).getByText("player.json isn’t valid JSON; skipped"),
    ).toBeInTheDocument();
    expect(userState.exportBackup()).toBe(before);
  });

  it("offers the manual extraction fallback for an unreadable .sav and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportBackup();

    await importFiles([new File([new Uint8Array([1, 2, 3, 4])], "broken.sav")]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This file isn’t a readable Fields of Mistria save. It may be corrupt.",
      );
    });
    expect(screen.getByRole("link", { name: "vaultc" })).toBeInTheDocument();
    const fallback = screen.getByText(/Then import from the resulting/);
    expect(fallback).toHaveTextContent(
      "Then import from the resulting player.json, gamedata.json, and quests.json files.",
    );
    expect([...fallback.querySelectorAll("code")].map((code) => code.textContent)).toEqual([
      "player.json",
      "gamedata.json",
      "quests.json",
    ]);
    expect(userState.exportBackup()).toBe(before);
  });
});

describe("save import atomicity", () => {
  it("rejects an oversized save before reading it and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportBackup();
    const file = new File([], "oversized.sav");
    Object.defineProperty(file, "size", { value: MAX_COMPRESSED_SIZE + 1 });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    await importFiles([file]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This save file is too large (8 MB). The maximum supported size is 8 MB.",
      );
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(userState.exportBackup()).toBe(before);
  });
});

describe("save import file picker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters the picker to save files on desktop", () => {
    render(ImportCard, { open: true });
    expect(screen.getByLabelText("Choose save files to import")).toHaveAttribute(
      "accept",
      ".sav,.json",
    );
  });

  it("drops the accept filter on iPadOS, which reports a desktop Mac user agent", async () => {
    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    render(ImportCard, { open: true });
    await waitFor(() => {
      expect(screen.getByLabelText("Choose save files to import")).not.toHaveAttribute("accept");
    });
  });

  it("still shows the import error for a file that is not a save", async () => {
    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
      platform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    await importFiles([new File(["not a save"], "photo.png")]);
    expect(await screen.findByRole("alert")).toHaveTextContent(".sav");
  });

  it("shows the picker hint on iOS only", async () => {
    const { unmount } = render(ImportCard, { open: true });
    expect(screen.queryByTestId("ios-picker-hint")).toBeNull();
    unmount();

    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
      platform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    render(ImportCard, { open: true });
    expect(await screen.findByTestId("ios-picker-hint")).toHaveTextContent(".sav");
  });
});
