import { tick } from "svelte";
import { beforeEach, expect, it, vi } from "vitest";

import * as sourceChecklist from "#lib/controllers/source-checklist.js";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { getMaxRenownLevel, MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { perksOfSkill } from "#lib/engine/projections/skills.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

import SourceContent from "./source-content.test-harness.svelte";

import type { StoreId } from "#lib/types/tracker-data.js";

const firstSkill = recordKeys(trackerData.skills)[0];

beforeEach(async () => {
  await userState.startTrackingByHand();
  // The registration doesn't depend on how many rows render, and rendering every row took this file
  // past its CI time budget. This per-test spy restores automatically.
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
  ]);
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

it("leaves the mine floor record out of a search", async () => {
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  expect(view.queryByText("Upper Mines")).toBeInTheDocument();

  toolbarState.setSearchQuery("acorn");
  await tick();
  expect(view.queryByText("Upper Mines")).toBeNull();
});

it("hides the Progress group during a search that matches nothing in it", async () => {
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  toolbarState.setSearchQuery("acorn");
  await tick();
  await tick();
  expect(view.queryByRole("button", { name: "Progress" })).toBeNull();
});

it("keeps the Progress group during a search that matches a skill", async () => {
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  toolbarState.setSearchQuery(getName("skills", firstSkill, "en"));
  await tick();
  await tick();
  expect(view.getByRole("button", { name: "Progress" })).toBeVisible();
});

it("hides the Completed divider when a search leaves only an empty Progress group in it", async () => {
  userState.setRenown(getMaxRenownLevel());
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  expect(view.getByTestId("everything-completed").hidden).toBe(false);

  toolbarState.setSearchQuery("acorn");
  await tick();
  await tick();
  expect(view.getByTestId("everything-completed").hidden).toBe(true);

  // A finished skill still matches, so the divider stays for it.
  userState.setSkillLevel(firstSkill, MAX_SKILL_LEVEL);
  for (const perk of perksOfSkill(firstSkill)) userState.togglePerk(perk);
  toolbarState.setSearchQuery(getName("skills", firstSkill, "en"));
  await tick();
  await tick();
  expect(view.getByTestId("everything-completed").hidden).toBe(false);
});

it("brings the Progress group back when the search clears", async () => {
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  toolbarState.setSearchQuery("acorn");
  await tick();
  await tick();
  expect(view.queryByRole("button", { name: "Progress" })).toBeNull();

  toolbarState.setSearchQuery("");
  await tick();
  expect(view.getByRole("button", { name: "Progress" })).toBeVisible();
});
