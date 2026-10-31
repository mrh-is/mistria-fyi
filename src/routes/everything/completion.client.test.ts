import { fireEvent, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { pageMetadata } from "#lib/data/page-metadata.js";
import { getMaxRenownLevel, MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { perksOfSkill } from "#lib/engine/projections/skills.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import AllPage from "./+page.svelte";

import type { ItemId, SkillId, SpellId } from "#lib/types/tracker-data.js";

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
});

it("opens incomplete categories, supports collapse, and resets after a fresh mount", async () => {
  const view = renderWithFeedback(AllPage, props);
  const trigger = view.getByRole("button", { name: "Almanac" });
  expect(trigger.querySelector(".font-data")).not.toBeNull();
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(view.queryByRole("button", { name: /^Artifacts,/ })).not.toBeInTheDocument();
  await fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await fireEvent.click(trigger);
  view.unmount();
  const fresh = renderWithFeedback(AllPage, props);
  expect(fresh.getByRole("button", { name: "Almanac" })).toHaveAttribute("aria-expanded", "true");
});

it("gathers complete sections below one divider and moves a reopened section back", async () => {
  for (const id of Object.keys(trackerData.mines.spells)) userState.toggleSpell(id as SpellId);
  userState.setRenown(getMaxRenownLevel());
  userState.toggleAlmanacItem("acorn" as ItemId);
  userState.toggleShowCompleted();
  const view = renderWithFeedback(AllPage, props);
  await tick();

  const completed = view.getByTestId("everything-completed");
  // One completed item doesn't finish an almanac section or create an empty completed category.
  expect(within(completed).queryByRole("button", { name: "Almanac" })).not.toBeInTheDocument();
  expect(within(completed).getByRole("heading", { name: "Completed" })).toBeInTheDocument();
  expect(within(completed).queryByRole("button", { name: "Completed" })).not.toBeInTheDocument();
  const finishedMines = within(completed).getByRole("button", { name: "Mines" });
  expect(finishedMines).toHaveAttribute("aria-expanded", "false");
  const activeMines = view
    .getAllByRole("button", { name: "Mines" })
    .find((button) => !completed.contains(button));
  expect(activeMines).toHaveAttribute("aria-expanded", "true");
  expect(view.getAllByRole("button", { name: "Renown" })).toHaveLength(1);
  expect(completed.contains(view.getByRole("button", { name: "Renown" }))).toBe(true);

  await fireEvent.click(finishedMines);
  expect(within(completed).getByRole("button", { name: /^Magic Spells,/ })).toBeInTheDocument();
  expect(within(completed).queryByText(/Current floor/)).not.toBeInTheDocument();
  userState.toggleSpell(Object.keys(trackerData.mines.spells)[0] as SpellId);
  await waitFor(() =>
    expect(within(completed).queryByRole("button", { name: "Mines" })).not.toBeInTheDocument(),
  );
  expect(view.getByRole("button", { name: /^Magic Spells,/ })).toBeInTheDocument();
  userState.toggleShowCompleted();
  await tick();
  expect(view.queryByTestId("everything-completed")).not.toBeInTheDocument();
  expect(toolbarState.hasAlmanacFilters).toBe(true);
});

it("partitions compact skill records only after both their level and perks are finished", async () => {
  const id = Object.keys(trackerData.skills)[0] as SkillId;
  const name = getName("skills", id, "en");
  const perks = perksOfSkill(id);
  expect(perks.length).toBeGreaterThan(0);
  userState.setSkillLevel(id, MAX_SKILL_LEVEL);
  userState.toggleShowCompleted();
  const view = renderWithFeedback(AllPage, props);
  const completed = view.getByTestId("everything-completed");
  expect(within(completed).queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
  for (const perk of perks) userState.togglePerk(perk);
  await tick();
  const finishedSkills = within(completed).getByRole("button", { name: "Skills" });
  expect(finishedSkills).toHaveAttribute("aria-expanded", "false");
  await fireEvent.click(finishedSkills);
  expect(within(completed).getAllByRole("listitem")).toHaveLength(1);
  expect(
    within(within(completed).getByRole("listitem")).getByText(name, { exact: true }),
  ).toBeInTheDocument();
  userState.togglePerk(perks[0]);
  await tick();
  expect(within(completed).queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
  expect(
    within(view.getByRole("list", { name: "Skills ledger" })).getByText(name, { exact: true }),
  ).toBeInTheDocument();
});
