import { fireEvent, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, expect, it, vi } from "vitest";

import * as sourceChecklist from "#lib/controllers/source-checklist.js";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import * as undoToast from "#lib/effects/undo-toast.js";
import { getMaxRenownLevel, MAX_HEART_LEVEL, MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { perksOfSkill } from "#lib/engine/projections/skills.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

import SourceContent from "./source-content.test-harness.svelte";

import type { StoreId, VillagerId } from "#lib/types/tracker-data.js";

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

it("keeps the same place and villager rows through search clear", async () => {
  const view = renderWithFeedback(SourceContent, { anchor: "store-balor", locale: "en" });
  const acorn = await view.findByRole("button", { name: "Check Acorn" });
  const adeline = view.getByRole("slider", { name: "Adeline heart level" });

  toolbarState.setSearchQuery("Adeline");
  await tick();
  expect(acorn).toBeInTheDocument();
  expect(acorn).not.toBeVisible();
  expect(adeline).toBeVisible();

  toolbarState.setSearchQuery("Acorn");
  await tick();
  expect(acorn).toBeInTheDocument();
  expect(adeline).toBeInTheDocument();
  expect(adeline).not.toBeVisible();

  toolbarState.setSearchQuery("");
  await tick();
  expect(view.getByRole("button", { name: "Check Acorn" })).toBe(acorn);
  expect(view.getByRole("slider", { name: "Adeline heart level" })).toBe(adeline);
});

it("lists this week’s birthdays and shares editable marks with Hearts to go", async () => {
  const showMeterUndo = vi.spyOn(undoToast, "showMeterUndo");
  const adeline = "adeline" as VillagerId;
  const balor = "balor" as VillagerId;
  const { day, season } = trackerData.villagers[adeline].birthday;
  userState.setCalendarDate(season, day, 1);
  userState.setHeartLevel(adeline, 2);
  userState.setHeartLevel(balor, 5);
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  const birthdays = within(view.getByRole("region", { name: "Birthdays this week" }));
  const hearts = within(view.getByRole("region", { name: "Hearts to go" }));
  const birthdayMark = birthdays.getByRole("slider", { name: "Adeline heart level" });
  const heartMark = hearts.getByRole("slider", { name: "Adeline heart level" });

  expect(birthdays.getAllByText("Soon").length).toBeGreaterThan(0);
  expect(hearts.getAllByRole("slider")[0]).toHaveAccessibleName("Balor heart level");
  await fireEvent.keyDown(birthdayMark, { key: "ArrowRight" });
  expect(heartMark).toHaveAttribute("aria-valuenow", "3");
  const edit = showMeterUndo.mock.lastCall?.[0];
  expect(edit).toMatchObject({ after: 3, before: 2 });
  edit?.undo(edit.before);
  await tick();
  expect(heartMark).toHaveAttribute("aria-valuenow", "2");
});

it("keeps a villager with full hearts available until their relationship is settled", async () => {
  const adeline = "adeline" as VillagerId;
  userState.setHeartLevel(adeline, MAX_HEART_LEVEL);
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  const relationships = await view.findByRole("region", { name: "Relationships" });
  expect(
    within(relationships).getByRole("slider", { name: "Adeline heart level" }),
  ).toHaveAttribute("aria-valuenow", String(MAX_HEART_LEVEL));
  expect(
    within(view.getByRole("region", { name: "Hearts to go" })).queryByRole("slider", {
      name: "Adeline heart level",
    }),
  ).toBeNull();

  const settle = within(relationships).getByRole("button", {
    name: getName("ui", "best_friend", "en"),
  });
  settle.focus();
  await fireEvent.click(settle);
  expect(view.queryByRole("region", { name: "Relationships" })).toBeNull();
  expect(view.getByRole("button", { name: "Stores" })).toHaveFocus();

  const completed = within(view.getByTestId("everything-completed"));
  await fireEvent.click(completed.getByRole("button", { name: "Completed" }));
  await fireEvent.click(completed.getByRole("button", { name: "Villagers" }));
  const finishedMark = completed.getByRole("slider", { name: "Adeline heart level" });
  expect(finishedMark).toBeVisible();
  toolbarState.setSearchQuery("Acorn");
  await tick();
  expect(finishedMark).toBeInTheDocument();
  expect(finishedMark).not.toBeVisible();
  toolbarState.setSearchQuery("");
  await tick();
  expect(completed.getByRole("slider", { name: "Adeline heart level" })).toBe(finishedMark);
});
