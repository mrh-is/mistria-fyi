import { tick } from "svelte";
import { beforeEach, expect, it, vi } from "vitest";

import * as sourceChecklist from "#lib/controllers/source-checklist.js";
import { pageMetadata } from "#lib/data/page-metadata.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import AllPage from "./+page.svelte";

import type { WaterType } from "#lib/types/acquisition.js";
import type { StoreId } from "#lib/types/tracker-data.js";

const props = {
  data: {
    locale: "en" as const,
    metadata: pageMetadata({ description: "test", title: "Everything" }),
  },
  params: {},
};

beforeEach(() => {
  userState.resetAll();
  pageStub.reset();
  // Routing needs representative anchors, not a repeated render of every acquisition instance.
  // Controller & projection tests cover the full data; this per-test spy restores automatically.
  vi.spyOn(sourceChecklist, "buildSourceChecklist").mockReturnValue([
    {
      category: "almanac",
      completed: false,
      fact: "almanac/entry",
      id: "acorn",
      key: "almanac:almanac-item:acorn",
      name: "Acorn",
      obtainable: true,
      reportCategory: "almanac-item",
      sources: [{ type: "store", storeId: "balor" as StoreId }],
      toggle: vi.fn(() => vi.fn()),
    },
    {
      category: "almanac",
      completed: false,
      fact: "almanac/entry",
      id: "anchovy",
      key: "almanac:almanac-item:anchovy",
      name: "Anchovy",
      obtainable: true,
      reportCategory: "almanac-item",
      sources: [{ type: "fish", waterTypes: ["ocean" as WaterType] }],
      toggle: vi.fn(() => vi.fn()),
    },
    {
      category: "almanac",
      completed: false,
      fact: "almanac/entry",
      id: "unsourced",
      key: "almanac:almanac-item:unsourced",
      name: "Unsourced entry",
      obtainable: true,
      reportCategory: "almanac-item",
      sources: [],
      toggle: vi.fn(() => vi.fn()),
    },
  ]);
});

it("offers both grouping lenses and renders source anchors from the device preference", async () => {
  userState.setEverythingGrouping("source");
  const view = renderWithFeedback(AllPage, props);
  await tick();
  expect(view.getByLabelText("Group by")).toBeTruthy();
  expect(view.container.querySelector("#sources-stores")).not.toBeNull();
  expect(view.container.querySelector("#store-balor")).not.toBeNull();
  expect(view.container.querySelector("#fish-ocean")).not.toBeNull();
  expect(view.container.querySelector("#source-progress")).not.toBeNull();
  expect(view.container.querySelector("#category-almanac")).toBeNull();
});

it("lets the URL override the device preference without replacing it", async () => {
  pageStub.navigate("/en/everything?group=source#store-balor");
  const sourceView = renderWithFeedback(AllPage, props);
  await tick();
  expect(sourceView.container.querySelector("#store-balor [data-ledger-row]")).not.toBeNull();
  expect(userState.state.everythingGrouping).toBe("category");
});
