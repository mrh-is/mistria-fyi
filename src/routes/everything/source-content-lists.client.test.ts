import { fireEvent, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEDGER_MOUNT_EVENT } from "#lib/components/ledger/ledger-context.js";
import * as sourceChecklist from "#lib/controllers/source-checklist.js";
import { loadNames, NAME_CHUNKS } from "#lib/data/names.js";
import * as celebration from "#lib/effects/celebrate.js";
import * as undoToast from "#lib/effects/undo-toast.js";
import { factKey } from "#lib/engine/provenance.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

import SourceContent from "./source-content.test-harness.svelte";

import type { Source, WaterType } from "#lib/types/acquisition.js";
import type { ItemId, StoreId } from "#lib/types/tracker-data.js";

beforeEach(async () => {
  await userState.startTrackingByHand();
  vi.spyOn(celebration, "celebrate").mockImplementation(() => undefined);
  vi.spyOn(celebration, "celebrateCategory").mockImplementation(() => undefined);
});

it("splits source types around a single Completed divider and opens an anchored finished source", async () => {
  vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
    {
      category: "almanac",
      completed: true,
      fact: factKey("almanac", "acorn"),
      id: "acorn",
      key: "acorn",
      name: "Acorn",
      obtainable: true,
      reportCategory: "almanac-item",
      sources: [{ type: "store", storeId: "balor" as StoreId }],
      toggle: vi.fn(() => vi.fn()),
    },
    {
      category: "almanac",
      completed: false,
      fact: factKey("almanac", "anchovy"),
      id: "anchovy",
      key: "anchovy",
      name: "Anchovy",
      obtainable: true,
      reportCategory: "almanac-item",
      sources: [{ type: "fish", waterTypes: ["ocean" as WaterType] }],
      toggle: vi.fn(() => vi.fn()),
    },
  ]);
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  const completed = view.getByTestId("everything-completed");
  await fireEvent.click(within(completed).getByRole("button", { name: "Completed" }));
  const finishedType = within(completed).getByRole("button", { name: "Stores" });
  expect(finishedType).toHaveAttribute("aria-expanded", "false");
  expect(view.getByRole("button", { name: "Fishing" })).toHaveAttribute("aria-expanded", "true");
  expect(within(completed).queryByRole("button", { name: /Balor/ })).not.toBeInTheDocument();
  expect(completed.querySelector("#sources-stores")).not.toBeNull();
  await fireEvent.click(finishedType);
  expect(within(completed).getByRole("button", { name: /Balor/ })).toBeInTheDocument();
  await fireEvent.click(finishedType);
  await view.rerender({ anchor: "sources-stores" });
  expect(finishedType).toHaveAttribute("aria-expanded", "true");
  await fireEvent.click(finishedType);
  await view.rerender({ anchor: "store-balor" });
  expect(finishedType).toHaveAttribute("aria-expanded", "true");
  expect(within(completed).getByRole("button", { name: "Uncheck Acorn" })).toBeInTheDocument();
  expect(view.container.querySelectorAll("#store-balor")).toHaveLength(1);
  await tick();
  expect(view.getAllByRole("button", { name: "Stores" })).toHaveLength(1);
});

function checklistRow(id: string, completed: boolean, sources: Source[]) {
  const entry = {
    category: "almanac" as const,
    completed,
    fact: factKey("almanac", id),
    id,
    key: id,
    name: id,
    obtainable: true,
    reportCategory: "almanac-item" as const,
    sources,
    toggle: () => {
      entry.completed = !entry.completed;
      // Any progress change makes the page rebuild its checklist.
      userState.toggleAlmanacItem("acorn" as ItemId);
      return () => undefined;
    },
  };
  return entry;
}

function mockChecklist() {
  const rows = [
    checklistRow("Anchovy", false, [{ type: "fish", waterTypes: ["ocean" as WaterType] }]),
    checklistRow("Bass", false, [{ type: "store", storeId: "balor" as StoreId }]),
  ];
  vi.spyOn(sourceChecklist, "buildSourceChecklist").mockImplementation(() => {
    // The real checklist reads progress, which is what rebuilds it after a toggle.
    void userState.state.progress.almanac.size;
    return rows.map((entry) => ({ ...entry }));
  });
}

it("names the Almanac variant in the source view’s checkbox label", async () => {
  const sources: Source[] = [{ type: "store", storeId: "balor" as StoreId }];
  vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
    {
      ...checklistRow("window", false, sources),
      name: "Animated Clouds Window",
      subtitle: "Oak",
    },
    { ...checklistRow("turnip", false, sources), name: "Turnip" },
  ]);
  const view = renderWithFeedback(SourceContent, { anchor: "store-balor", locale: "en" });

  expect(
    await view.findByRole("button", { name: "Check Animated Clouds Window, Oak" }),
  ).toBeInTheDocument();
  expect(view.getByRole("button", { name: "Check Turnip" })).toBeInTheDocument();
  expect(view.queryByRole("button", { name: "Check Animated Clouds Window" })).toBeNull();
});

it("uses each shelf's sources for its columns and omits the place’s own family", async () => {
  const store: Source = { type: "store", storeId: "balor" as StoreId };
  vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
    checklistRow("Anchovy", false, [store, { type: "fish", waterTypes: ["ocean" as WaterType] }]),
    checklistRow("Apple", false, [store]),
    checklistRow("Acorn", true, [store, { type: "forage" }]),
  ]);
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  const place = within(await view.findByRole("region", { name: "Balor's Wagon" }));
  await fireEvent.click(place.getByRole("button", { name: "Balor's Wagon" }));
  const completed = place.getByText("Completed", { exact: true }).closest("details");
  expect(completed).not.toHaveAttribute("open");
  // Fishing picks out one of the two To do rows, so its head can highlight them.
  const fishing = place.getByRole("button", { name: "Highlight rows from Fishing" });
  // Every Completed row is a Gathering row, so its head is only a label.
  const gathering = place.getByText("Gathering", { exact: true });
  expect(fishing).toBeVisible();
  expect(fishing.closest("details")).toBeNull();
  expect(gathering.closest("details")).toBe(completed);
  expect(place.queryByRole("button", { name: "Highlight rows from Gathering" })).toBeNull();
  expect(place.queryByRole("button", { name: "Highlight rows from Stores" })).toBeNull();
  await fireEvent.click(fishing);
  expect(fishing).toHaveAttribute("aria-pressed", "true");
  await fireEvent.click(fishing);
  expect(fishing).toHaveAttribute("aria-pressed", "false");

  await fireEvent.click(place.getByText("Completed", { exact: true }));
  expect(completed).toHaveAttribute("open");
  expect(gathering).toBeVisible();
});

const openFishing = async (view: ReturnType<typeof renderWithFeedback>) => {
  await fireEvent.click(view.getByRole("button", { name: /Ocean/ }));
  await tick();
  return view.getByRole("button", { name: "Check Anchovy" });
};

describe("while source shelves hold", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("keeps a finished row and its focus in the same shelf", async () => {
    mockChecklist();
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    const row = await openFishing(view);
    row.focus();
    await fireEvent.click(row);
    await tick();
    expect(view.queryByRole("button", { name: "Fishing" })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS);
    await tick();
    await tick();
    expect(view.getByRole("button", { name: "Fishing" })).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Uncheck Anchovy" })).toBe(row);
    expect(row).toHaveFocus();
    expect(within(view.getByRole("region", { name: /Ocean/ })).getByText("1 to do")).toBeVisible();
    expect(view.queryByRole("button", { name: "Refresh shelves" })).toBeNull();
  });

  it("moves a finished source section to Completed after refreshing the shelves", async () => {
    mockChecklist();
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    const completed = view.getByTestId("everything-completed");
    const row = await openFishing(view);
    row.focus();
    await fireEvent.click(row);
    await tick();
    expect(within(completed).queryByRole("button", { name: "Fishing" })).toBeNull();
    userState.setSeason("winter");
    await tick();
    expect(view.getByRole("button", { name: "Uncheck Anchovy" })).toBe(row);
    await fireEvent.click(view.getByRole("button", { name: "Refresh shelves" }));
    await tick();
    await fireEvent.click(within(completed).getByRole("button", { name: "Completed" }));
    expect(within(completed).getByRole("button", { name: "Fishing" })).toBeInTheDocument();
  });

  it("finds a row on a closed Not now shelf and shows its match count", async () => {
    const source: Source = {
      type: "fish",
      availability: { type: "season", seasons: ["winter"] },
      waterTypes: ["ocean" as WaterType],
    };
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      checklistRow("Anchovy", false, [source]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    toolbarState.setSearchQuery("Anchovy");
    await tick();
    const summary = view.getByText(/1 match/u);
    expect(summary.closest("details")).not.toHaveAttribute("open");
    await fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(view.getByRole("button", { name: "Check Anchovy" })).toBeVisible();
  });

  it("counts matches in finished places without opening the Completed fold", async () => {
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      checklistRow("Anchovy", true, [
        { type: "fish", waterTypes: ["ocean" as WaterType, "river" as WaterType] },
      ]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    toolbarState.setSearchQuery("Anchovy");
    await tick();
    const completed = within(view.getByTestId("everything-completed"));
    expect(completed.queryByText("2 matches")).toBeNull();
    expect(completed.getAllByText("1 match")[0]).toBeVisible();
    expect(completed.getByRole("button", { name: "Completed" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("offers to refresh an open ledger after a backup restore with the same clock", async () => {
    const backup = userState.exportBackup();
    userState.toggleAlmanacItem("acorn" as ItemId);
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockImplementation(() => [
      checklistRow("Acorn", userState.state.progress.almanac.has("acorn" as ItemId), [
        { type: "store", storeId: "balor" as StoreId },
      ]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "store-balor", locale: "en" });
    await tick();
    const row = view.getByRole("button", { name: "Uncheck Acorn" });

    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    await tick();
    expect(view.getByRole("button", { name: "Check Acorn" })).toBe(row);
    const refresh = view.getByRole("button", { name: "Refresh shelves" });
    refresh.focus();
    await fireEvent.click(refresh);
    expect(view.queryByRole("button", { name: "Refresh shelves" })).toBeNull();
    expect(view.getByText("1 to do")).toBeVisible();
    // The button leaves with the notice, so focus stays in the ledger rather than on the body.
    await tick();
    expect(document.activeElement?.closest("[data-ledger-content]")).not.toBeNull();
  });

  it("rebuilds the captured place names when a mounted ledger changes language", async () => {
    await loadNames("fr", NAME_CHUNKS);
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      checklistRow("Acorn", false, [{ type: "store", storeId: "balor" as StoreId }]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "store-balor", locale: "en" });
    await tick();
    expect(view.getByRole("button", { name: "Balor's Wagon" })).toBeVisible();
    await view.rerender({ anchor: "store-balor", locale: "fr" });
    expect(view.getByRole("button", { name: "Chariot de Balor" })).toBeVisible();
    expect(view.queryByRole("button", { name: "Balor's Wagon" })).toBeNull();
  });

  it("closes the source panel when the discovery chip is pressed again", async () => {
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      checklistRow("Acorn", false, [
        { type: "store", storeId: "balor" as StoreId },
        {
          type: "store",
          storeId: "balor" as StoreId,
          visibility: { type: "mineFloor", floor: 80 },
        },
      ]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "store-balor", locale: "en" });
    await tick();
    const chip = view.getByRole("button", { name: "+1 to discover" });
    await fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(view.getByTestId("source-card")).toBeVisible();
    await fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "false");
    // The sheet keeps its sources so it can slide shut over them; it's hidden & inert once closed.
    expect(view.getByTestId("source-card").closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("updates spoiler masks without replacing the current shelf", async () => {
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      {
        ...checklistRow("Anchovy", false, [{ type: "fish", waterTypes: ["ocean" as WaterType] }]),
        spoilered: true,
      },
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "fish-ocean", locale: "en" });
    await tick();
    const checkbox = view.getByRole("button", { name: "Check spoilered item" });
    userState.toggleShowSpoilers();
    await tick();
    expect(view.getByRole("button", { name: "Check Anchovy" })).toBe(checkbox);
    expect(view.queryByRole("button", { name: "Refresh shelves" })).toBeNull();
    userState.toggleShowSpoilers();
    await tick();
    expect(view.getByRole("button", { name: "Check spoilered item" })).toBe(checkbox);
  });

  it("keeps a covered row's name out of the undo toast when unchecking it", async () => {
    const showUndoToast = vi.spyOn(undoToast, "showUndoToast");
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      {
        ...checklistRow("Anchovy", true, [{ type: "fish", waterTypes: ["ocean" as WaterType] }]),
        spoilered: true,
      },
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "fish-ocean", locale: "en" });
    await tick();
    await fireEvent.click(view.getByRole("button", { name: "Uncheck spoilered item" }));
    // The spread copy keeps the mock's own completion, so only the cover is asserted here.
    expect(showUndoToast).toHaveBeenCalledWith(
      "Anchovy",
      expect.any(Boolean),
      expect.any(Function),
      true,
      undefined,
    );
  });

  it("mounts a place's rows only while the place is open", async () => {
    const ocean: Source = {
      type: "fish",
      availability: { type: "season", seasons: ["winter"] },
      waterTypes: ["ocean" as WaterType],
    };
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      checklistRow("Anchovy", false, [ocean]),
      checklistRow("Bream", true, [ocean]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    const place = view.container.querySelector<HTMLElement>("#fish-ocean");
    if (!place) throw new Error("Expected the Ocean section");
    // A closed place keeps its head but leaves its rows out of the document (#714).
    expect(place.querySelectorAll("[data-ledger-fact]")).toHaveLength(0);
    await fireEvent.click(view.getByRole("button", { name: /^Ocean/ }));
    // Anchovy waits on Not now and Bream is done, so both shelves start closed & empty.
    expect(place.querySelectorAll("[data-ledger-fact]")).toHaveLength(0);
    await fireEvent.click(within(place).getByText("Not now", { exact: true }));
    await tick();
    expect(within(place).getByText("Anchovy", { exact: true })).toBeInTheDocument();
    expect(within(place).queryByText("Bream", { exact: true })).not.toBeInTheDocument();
    await fireEvent.click(view.getByRole("button", { name: /^Ocean/ }));
    expect(place.querySelectorAll("[data-ledger-fact]")).toHaveLength(0);
  });

  it("unmounts a shelf's rows when the reader closes it, even after a reveal", async () => {
    const ocean: Source = {
      type: "fish",
      availability: { type: "season", seasons: ["winter"] },
      waterTypes: ["ocean" as WaterType],
    };
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      checklistRow("Anchovy", false, [ocean]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    const place = view.container.querySelector<HTMLElement>("#fish-ocean");
    const section =
      place?.closest<HTMLElement>("[data-ledger-section]") ??
      place?.querySelector<HTMLElement>("[data-ledger-section]");
    if (!place || !section) throw new Error("Expected the Ocean section");
    await fireEvent.click(view.getByRole("button", { name: /^Ocean/ }));
    const notNow = within(place).getByText("Not now", { exact: true });
    await fireEvent.click(notNow);
    await tick();
    const key = place.querySelector<HTMLElement>("[data-ledger-key]")?.dataset.ledgerKey;
    if (!key) throw new Error("Expected the Anchovy row");
    await fireEvent.click(notNow);
    await tick();
    expect(place.querySelectorAll("[data-ledger-fact]")).toHaveLength(0);
    // Back reveals the shelf to restore a row; closing it afterward still unmounts the rows.
    section.dispatchEvent(new CustomEvent(LEDGER_MOUNT_EVENT, { detail: key }));
    await tick();
    expect(within(place).getByText("Anchovy", { exact: true })).toBeInTheDocument();
    await fireEvent.click(notNow);
    await tick();
    expect(place.querySelectorAll("[data-ledger-fact]")).toHaveLength(0);
  });

  it("names the season for this place when a row also has a seasonal source elsewhere", async () => {
    vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
      checklistRow("Anchovy", false, [
        {
          type: "fish",
          availability: { type: "season", seasons: ["winter"] },
          waterTypes: ["ocean" as WaterType],
        },
        {
          type: "fish",
          availability: { type: "season", seasons: ["summer"] },
          waterTypes: ["river" as WaterType],
        },
      ]),
    ]);
    const view = renderWithFeedback(SourceContent, { anchor: "fish-ocean", locale: "en" });
    await tick();
    const place = view.container.querySelector<HTMLElement>("#fish-ocean");
    if (!place) throw new Error("Expected the Ocean section");
    const ocean = within(place);
    await fireEvent.click(ocean.getByText("Not now", { exact: true }));
    await fireEvent.click(ocean.getByRole("button", { name: /Anchovy Almanac/u }));
    expect(ocean.getByText("Comes back by waiting, in winter.")).toBeVisible();
  });

  it("celebrates a source the toggle finishes, but not unticking it again", async () => {
    mockChecklist();
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    await fireEvent.click(await openFishing(view));
    expect(celebration.celebrate).toHaveBeenCalledTimes(1);
    expect(celebration.celebrateCategory).not.toHaveBeenCalled();

    await fireEvent.click(view.getByRole("button", { name: "Uncheck Anchovy" }));
    expect(celebration.celebrate).toHaveBeenCalledTimes(1);
  });

  it("hides the Completed divider while no source is finished", async () => {
    mockChecklist();
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    expect(view.getByTestId("everything-completed").hidden).toBe(true);
  });
});
