import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { MAX_COMPRESSED_SIZE } from "$lib/engine/parse-sav.js";
import { userState } from "$lib/stores/user-state.svelte.js";
import { recordKeys } from "$lib/utils.js";

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
    expect(screen.getAllByText("Unknown cosmetic: not_a_cosmetic")).toHaveLength(2);
    expect(screen.getByText("gamedata.json: invalid JSON")).toBeInTheDocument();
  });

  it("reports unparseable JSON files and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportState();

    await importFiles([new File(["{"], "player.json")]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("player.json: invalid JSON");
    });
    expect(userState.exportState()).toBe(before);
  });

  it("offers the manual extraction fallback for an unreadable .sav and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportState();

    await importFiles([new File([new Uint8Array([1, 2, 3, 4])], "broken.sav")]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
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
      expect(screen.getByText(/Save file is too large/)).toBeInTheDocument();
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(userState.exportState()).toBe(before);
  });
});
