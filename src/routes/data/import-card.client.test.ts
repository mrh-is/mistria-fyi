import { fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { MAX_COMPRESSED_SIZE } from "#lib/engine/parse-sav.js";
import * as m from "#lib/paraglide/messages.js";
import { PROGRESS_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { buildSavFile } from "#lib/test-utils/sav.js";
import { enableSpoilers } from "#lib/test-utils/spoilers.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";
import { recordKeys } from "#lib/utils/record.js";

import ImportCard from "./import-card.svelte";

beforeEach(async () => {
  await userState.startTrackingByHand();
});

async function importFiles(files: File[]) {
  renderWithFeedback(ImportCard, { open: true });
  await fireEvent.change(screen.getByLabelText(m.import_file_input_aria()), {
    target: { files },
  });
}

describe("finding the save file", () => {
  it("keeps the key caps & file suffix inside each step's sentence", async () => {
    renderWithFeedback(ImportCard, { open: true });
    await fireEvent.click(screen.getByRole("button", { name: m.import_where_is_save() }));

    const dialog = await screen.findByRole("dialog");
    const steps = within(dialog)
      .getAllByRole("listitem")
      .map((step) => step.textContent.replaceAll(/\s+/gu, " ").trim());
    expect(steps).toContain("Press Win + R to open the Run dialog");
    expect(steps).toContain("Drag the file ending in -autosave.sav onto the drop zone above.");
  });
});

describe("save import", () => {
  it("offers a next step after success without a desktop transfer callback", async () => {
    await importFiles([buildSavFile({ player: { items_acquired: [] } })]);
    const next = await screen.findByRole("link", { name: m.import_view_progress() });
    expect(next).toBeVisible();
    expect(next).toHaveAttribute("href", "/en/everything");
  });

  it("can cancel a different farm, then explicitly merge it without losing progress", async () => {
    const save = buildSavFile(
      { player: { items_acquired: ["animated_waterfall_v2"] } },
      "game-456-autosave.sav",
    );

    await userState.mergeFromSave(
      { renown: 7 },
      {
        metadata: {
          farmName: "Fern",
          identity: { creationVersion: null, saveNumber: "123" },
          importedAt: Date.now(),
          playerName: null,
        },
      },
    );
    const before = userState.exportBackup();
    await importFiles([save]);
    const dialog = await screen.findByRole("dialog", { name: m.import_farm_title() });
    expect(userState.exportBackup()).toBe(before);
    await fireEvent.click(within(dialog).getByRole("button", { name: m.import_farm_cancel() }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(userState.exportBackup()).toBe(before);

    await fireEvent.change(screen.getByLabelText(m.import_file_input_aria()), {
      target: { files: [save] },
    });
    const retry = await screen.findByRole("dialog");
    await fireEvent.click(within(retry).getByRole("button", { name: m.import_farm_merge() }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(m.import_status_completed());
    });
    expect(userState.state.progress.renown).toBe(7);
    expect(userState.state.lastImport?.identity.saveNumber).toBe("456");
    const source = screen.getByText(m.merge_imported_from({ files: "game-456-autosave.sav" }));
    expect(source).not.toBeVisible();
    expect(screen.queryByText("Imported from player.json")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: m.import_view_progress() })).toHaveAttribute(
      "href",
      "/en/everything",
    );
  });

  it("can cancel a renamed save without changing the tracked farm or its progress", async () => {
    const save = buildSavFile(
      { player: { farm_name: "Moss", items_acquired: ["animated_waterfall_v2"] } },
      "renamed.sav",
    );
    await userState.mergeFromSave(
      { renown: 7 },
      {
        metadata: {
          farmName: "Fern",
          identity: { creationVersion: null, saveNumber: "123" },
          importedAt: Date.now(),
          playerName: null,
        },
      },
    );
    const before = userState.exportBackup();
    const stored = localStorage.getItem(PROGRESS_STORAGE_KEY);

    await importFiles([save]);
    const dialog = await screen.findByRole("dialog", {
      name: m.sync_farm_question_title(),
    });
    expect(userState.exportBackup()).toBe(before);
    await fireEvent.click(within(dialog).getByRole("button", { name: m.import_farm_cancel() }));
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-state", "closed");
    expect(dialog).toHaveTextContent(m.sync_farm_question_title());
    expect(dialog).toHaveTextContent(m.import_farm_unnumbered_description());
    await waitFor(() => expect(dialog).not.toBeInTheDocument());

    expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).toBe(stored);
    userState.loadFromStorage();
    expect(userState.exportBackup()).toBe(before);
  });

  it("imports unnumbered progress into a hand-tracked lane without a farm question", async () => {
    await importFiles([
      buildSavFile(
        { player: { farm_name: "Fern", items_acquired: [], name: "Ada" } },
        "renamed.sav",
      ),
    ]);
    const history = await screen.findByTestId("last-import");
    expect(history).toHaveTextContent("Fern · Ada");
    expect(history).toHaveTextContent("Last imported now");
    expect(history).toHaveTextContent(m.import_unknown_version());
    expect(screen.getByText(/Created in unknown version/)).not.toBeVisible();
    expect(history.querySelector("summary")).toHaveTextContent(m.import_save_details());
    expect(userState.state.lastImport?.identity).toEqual({
      creationVersion: null,
      saveNumber: null,
    });
  });

  it("shows persisted import history and preserves it after an unsuccessful import", async () => {
    const metadata = {
      farmName: "Fern",
      identity: {
        creationVersion: { major: 0, minor: 11, patch: 7, pre: null },
        saveNumber: "123456",
      },
      importedAt: Date.now() - 120_000,
      playerName: "Ada",
    };
    await userState.mergeFromSave({}, { metadata });
    renderWithFeedback(ImportCard, { open: true });
    expect(screen.getByTestId("last-import")).toHaveTextContent("Save #123456 · Created in 0.11.7");
    expect(screen.getByTestId("last-import")).toHaveTextContent("Last imported 2 minutes ago");
    await fireEvent.change(screen.getByLabelText(m.import_file_input_aria()), {
      target: { files: [new File(["{"], "player.json")] },
    });
    await screen.findByRole("alert");
    expect(userState.state.lastImport).toEqual(metadata);
  });

  it("announces no new data on a repeated import after a successful source-file summary", async () => {
    renderWithFeedback(ImportCard, { open: true });
    const input = screen.getByLabelText(m.import_file_input_aria());
    const files = [buildSavFile({ player: { items_acquired: [] } })];

    await fireEvent.change(input, { target: { files } });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(m.import_status_completed());
    });
    expect(
      screen.getByText(m.merge_imported_from({ files: "game-1315159680-autosave.sav" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.merge_imported_from({ files: "game-1315159680-autosave.sav" })),
    ).not.toBeVisible();
    expect(screen.getByRole("link", { name: m.import_view_progress() })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();

    await fireEvent.change(input, { target: { files } });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(m.data_no_new_data_import());
    });
    expect(screen.getByText(m.data_no_new_data_import(), { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a successful source-file summary and warning count", async () => {
    await importFiles([
      buildSavFile({
        player: { items_acquired: ["animated_waterfall_v2"], perks: ["unknown_perk"] },
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(m.import_status_completed());
    });
    expect(
      screen.getByText(m.merge_imported_from({ files: "game-1315159680-autosave.sav" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.import_warnings_summary({ count: 1 }), { exact: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("records what the save adds with the save's playtime", async () => {
    const cosmeticId = recordKeys(trackerData.cosmetics)[0];

    await importFiles([
      buildSavFile({ header: { playtime: 3600.25 }, player: { cosmetic_unlocks: [cosmeticId] } }),
    ]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(m.import_status_completed());
    });
    expect(userState.lastSavePlaytime).toBe(3600.25);
    expect(userState.provenanceOf(`cosmetics/${cosmeticId}`)).toEqual({
      playtime: 3600.25,
      source: "save",
    });
  });

  it("renders repeated warnings from the same save", async () => {
    const cosmeticId = recordKeys(trackerData.cosmetics)[0];
    await importFiles([
      buildSavFile({
        player: { cosmetic_unlocks: [cosmeticId, "not_a_cosmetic", "not_a_cosmetic"] },
      }),
    ]);

    expect(
      await screen.findAllByText(
        "player.cosmetic_unlocks: unrecognized ID not_a_cosmetic; skipped",
      ),
    ).toHaveLength(2);
    expect(userState.state.progress.cosmetics.has(cosmeticId)).toBe(true);
  });

  it.each(["picker", "drop"])("rejects extracted JSON through the %s", async (entry) => {
    const before = userState.exportBackup();
    const files = [new File(['{"items_acquired":["turnip"]}'], "player.json")];
    if (entry === "picker") {
      await importFiles(files);
    } else {
      renderWithFeedback(ImportCard, { open: true });
      await fireEvent.drop(screen.getByRole("button", { name: m.import_browse_files() }), {
        dataTransfer: { files },
      });
    }
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Choose a \.sav file\.$/);
    expect(userState.exportBackup()).toBe(before);
  });

  it("offers autosave guidance for an unreadable .sav and preserves tracker state", async () => {
    enableSpoilers();
    const before = userState.exportBackup();

    await importFiles([new File([new Uint8Array([1, 2, 3, 4])], "broken.sav")]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Hmm, we can’t read this as a Fields of Mistria save. It might be damaged, or a different file. Try the newest file that ends in “autosave”.",
      );
    });
    expect(userState.exportBackup()).toBe(before);
  });
});

describe("save import atomicity", () => {
  it.each([true, false])(
    "asks the player to update when newer data blocks import (loaded before import: %s)",
    async (loaded) => {
      const newer = JSON.stringify({
        progress: { renown: 17 },
        version: CURRENT_SERIALIZATION_VERSION + 1,
      });
      const quarantine = localStorage.getItem(QUARANTINE_STORAGE_KEY);
      localStorage.setItem(PROGRESS_STORAGE_KEY, newer);
      if (loaded) userState.loadFromStorage();

      await importFiles([buildSavFile({ player: { items_acquired: ["turnip"] } })]);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        m.persistence_warning_newer_data(),
      );
      expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).toBe(newer);
      expect(localStorage.getItem(QUARANTINE_STORAGE_KEY)).toBe(quarantine);
      expect(userState.state.progress.almanac.size).toBe(0);
    },
  );

  it("rejects an oversized save before reading it and preserves tracker state", async () => {
    enableSpoilers();
    const before = userState.exportBackup();
    const file = new File([], "oversized.sav");
    Object.defineProperty(file, "size", { value: MAX_COMPRESSED_SIZE + 1 });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    await importFiles([file]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Mamma mia, that’s a big file. This app can only read save files up to 8 MB, and that file is 8 MB. Maybe double-check you picked the right one?",
      );
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(userState.exportBackup()).toBe(before);
  });
});

describe("save import file picker", () => {
  it("filters the picker to save files on desktop", () => {
    renderWithFeedback(ImportCard, { open: true });
    expect(screen.getByLabelText(m.import_file_input_aria())).toHaveAttribute("accept", ".sav");
  });

  it("drops the accept filter on iPadOS, which reports a desktop Mac user agent", async () => {
    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
    renderWithFeedback(ImportCard, { open: true });
    await waitFor(() => {
      expect(screen.getByLabelText(m.import_file_input_aria())).not.toHaveAttribute("accept");
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
    const { unmount } = renderWithFeedback(ImportCard, { open: true });
    expect(screen.queryByTestId("ios-picker-hint")).toBeNull();
    unmount();

    vi.stubGlobal("navigator", {
      maxTouchPoints: 5,
      platform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    renderWithFeedback(ImportCard, { open: true });
    expect(await screen.findByTestId("ios-picker-hint")).toHaveTextContent(".sav");
  });
});
