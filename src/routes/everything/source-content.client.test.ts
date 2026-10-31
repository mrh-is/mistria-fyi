import { fireEvent, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sourceChecklist from "#lib/controllers/source-checklist.js";
import * as celebration from "#lib/effects/celebrate.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

import SourceContent from "./source-content.svelte";

import type { Source, WaterType } from "#lib/types/acquisition.js";
import type { ItemId, StoreId } from "#lib/types/tracker-data.js";

beforeEach(() => {
  userState.resetAll();
  vi.spyOn(celebration, "celebrate").mockImplementation(() => undefined);
  vi.spyOn(celebration, "celebrateCategory").mockImplementation(() => undefined);
});

it("keeps the Unobtainable display control available while the source lens renders almanac rows", async () => {
  expect(toolbarState.hasAlmanacFilters).toBe(false);
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  expect(toolbarState.hasAlmanacFilters).toBe(true);
  view.unmount();
  await tick();
  expect(toolbarState.hasAlmanacFilters).toBe(false);
});

it("splits source types around a single Completed divider and opens an anchored finished source", async () => {
  vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
    {
      category: "almanac",
      completed: true,
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
      id: "anchovy",
      key: "anchovy",
      name: "Anchovy",
      obtainable: true,
      reportCategory: "almanac-item",
      sources: [{ type: "fish", waterTypes: ["ocean" as WaterType] }],
      toggle: vi.fn(() => vi.fn()),
    },
  ]);
  userState.toggleShowCompleted();
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  const completed = view.getByTestId("everything-completed");
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
  userState.toggleShowCompleted();
  await tick();
  expect(view.queryByRole("button", { name: "Stores" })).not.toBeInTheDocument();
});

function checklistRow(id: string, completed: boolean, sources: Source[]) {
  const entry = {
    category: "almanac" as const,
    completed,
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

const openFishing = async (view: ReturnType<typeof renderWithFeedback>) => {
  await fireEvent.click(view.getByRole("button", { name: /Ocean/ }));
  await tick();
  return view.getByRole("button", { name: "Check Anchovy" });
};

describe("while a source section changes lists", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("holds a finished source section, then keeps focus on a visible trigger", async () => {
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
    expect(view.queryByRole("button", { name: "Fishing" })).not.toBeInTheDocument();
    expect(document.activeElement?.matches("button[data-section-trigger]")).toBe(true);
    expect(document.activeElement?.closest("[hidden]")).toBeNull();
  });

  it("moves a finished source section to the completed list only after the hold", async () => {
    mockChecklist();
    userState.toggleShowCompleted();
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    const completed = view.getByTestId("everything-completed");
    const row = await openFishing(view);
    row.focus();
    await fireEvent.click(row);
    await tick();
    expect(within(completed).queryByRole("button", { name: "Fishing" })).toBeNull();
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS);
    await tick();
    await tick();
    expect(within(completed).getByRole("button", { name: "Fishing" })).toBeInTheDocument();
    expect(document.activeElement?.matches("button[data-section-trigger]")).toBe(true);
    expect(document.activeElement?.closest("[hidden]")).toBeNull();
  });

  it("hides the Completed divider while no source is finished", async () => {
    mockChecklist();
    userState.toggleShowCompleted();
    const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
    await tick();
    expect(view.getByTestId("everything-completed").hidden).toBe(true);
  });
});
