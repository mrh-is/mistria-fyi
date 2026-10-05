import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { MAX_COMPRESSED_SIZE } from "#lib/engine/parse-sav.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordKeys } from "#lib/utils.js";

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
    expect(userState.state.completed.cosmetics.has(cosmeticId)).toBe(true);
    // The duplicate warnings also exercise the index-keyed list, which a text key would break.
    expect(
      screen.getAllByText("player.cosmetic_unlocks: unrecognized ID not_a_cosmetic; skipped"),
    ).toHaveLength(2);
    expect(screen.getByText("gamedata.json isn’t valid JSON; skipped")).toBeInTheDocument();
  });

  it("reports unparseable JSON files and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportState();

    await importFiles([new File(["{"], "player.json")]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "None of the selected save files could be read.",
      );
    });
    expect(
      within(screen.getByRole("alert")).getByText("player.json isn’t valid JSON; skipped"),
    ).toBeInTheDocument();
    expect(userState.exportState()).toBe(before);
  });

  it("offers the manual extraction fallback for an unreadable .sav and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportState();

    await importFiles([new File([new Uint8Array([1, 2, 3, 4])], "broken.sav")]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This file isn’t a readable Fields of Mistria save. It may be corrupt.",
      );
    });
    expect(screen.getByRole("link", { name: "vaultc" })).toBeInTheDocument();
    expect(userState.exportState()).toBe(before);
  });
});

describe("save import atomicity", () => {
  it("rejects an oversized save before reading it and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportState();
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
    expect(userState.exportState()).toBe(before);
  });
});
