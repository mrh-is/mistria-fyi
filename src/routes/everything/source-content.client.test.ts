import { fireEvent, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, expect, it, vi } from "vitest";

import * as sourceChecklist from "#lib/controllers/source-checklist.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import SourceContent from "./source-content.svelte";

import type { WaterType } from "#lib/types/acquisition.js";
import type { StoreId } from "#lib/types/tracker-data.js";

beforeEach(() => {
  userState.resetAll();
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
