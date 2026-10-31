import { fireEvent, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { pageMetadata } from "#lib/data/page-metadata.js";
import { getMaxMineFloor, getMaxRenownLevel, MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { perksOfSkill } from "#lib/engine/projections/skills.js";
import * as questSections from "#lib/presentation/quest-sections.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

import AllPage from "./+page.svelte";

import type { QuestRow, QuestSection } from "#lib/presentation/quest-sections.js";
import type { ItemId, QuestType, SkillId, SpellId } from "#lib/types/tracker-data.js";

const HOLD_TIMEOUT_MS = ROW_LEAVE_MS + 1000;

vi.mock("#lib/effects/celebrate.js", () => ({ celebrate: vi.fn(), celebrateCategory: vi.fn() }));

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
  await waitFor(
    () => {
      expect(within(completed).queryByRole("button", { name: "Mines" })).not.toBeInTheDocument();
    },
    { timeout: HOLD_TIMEOUT_MS },
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
  const finishedSkills = await within(completed).findByRole(
    "button",
    { name: "Skills" },
    { timeout: HOLD_TIMEOUT_MS },
  );
  expect(finishedSkills).toHaveAttribute("aria-expanded", "false");
  await fireEvent.click(finishedSkills);
  expect(within(completed).getAllByRole("listitem")).toHaveLength(1);
  expect(
    within(within(completed).getByRole("listitem")).getByText(name, { exact: true }),
  ).toBeInTheDocument();
  userState.togglePerk(perks[0]);
  await waitFor(
    () => {
      expect(within(completed).queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
    },
    { timeout: HOLD_TIMEOUT_MS },
  );
  expect(
    within(view.getByRole("list", { name: "Skills ledger" })).getByText(name, { exact: true }),
  ).toBeInTheDocument();
});

const finishRowLeaving = async () => {
  await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS);
  await tick();
  // A focus repair waits for the page to settle.
  await tick();
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

const expectFocusOnRenderedTrigger = () => {
  const active = document.activeElement;
  expect(active?.matches("button[data-section-trigger]")).toBe(true);
  expect(active?.closest("[hidden]")).toBeNull();
};

async function renderWithLastSpellOpen() {
  // Reaching the mines' last floors unmasks every spell, so a toggle needs no spoiler confirmation.
  userState.setMineFloor(getMaxMineFloor() - 1);
  const spells = Object.keys(trackerData.mines.spells) as SpellId[];
  for (const id of spells.slice(1)) userState.toggleSpell(id);
  const view = renderWithFeedback(AllPage, props);
  await tick();
  const trigger = view.getByRole("button", { name: /^Magic Spells,/ });
  await fireEvent.click(trigger);
  await tick();
  const section = trigger.closest<HTMLElement>("[data-tracker-section]");
  if (!section) throw new Error("Magic Spells has no section");
  const row = within(section).getByRole("button", {
    name: `Check ${getName("spells", spells[0], "en")}`,
  });
  return { row, section, view };
}

describe("while a section changes lists", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds a finished section until its row leaves, then keeps focus on a visible trigger", async () => {
    const { row, section } = await renderWithLastSpellOpen();
    row.focus();
    await fireEvent.click(row);
    await nextFrame();
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 1);
    await tick();
    expect(section.hidden).toBe(false);
    await finishRowLeaving();
    expect(section.hidden).toBe(true);
    expectFocusOnRenderedTrigger();
  });

  it("keeps a section in one list during the hold when completed sections are shown", async () => {
    userState.toggleShowCompleted();
    const { row, section, view } = await renderWithLastSpellOpen();
    row.focus();
    await fireEvent.click(row);
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 1);
    await tick();
    expect(view.getAllByRole("button", { name: /^Magic Spells,/ })).toHaveLength(1);
    expect(section.hidden).toBe(false);
    await finishRowLeaving();
    expect(section.hidden).toBe(true);
    expect(
      within(view.getByTestId("everything-completed")).getByRole("button", { name: "Mines" }),
    ).toBeInTheDocument();
    expectFocusOnRenderedTrigger();
  });

  it("keeps focus on a visible trigger when a compact record finishes", async () => {
    const view = renderWithFeedback(AllPage, props);
    await tick();
    const input = view.getByRole("spinbutton", { name: /floor/i });
    input.focus();
    userState.setMineFloor(getMaxMineFloor());
    await finishRowLeaving();
    expect(input.isConnected).toBe(false);
    expectFocusOnRenderedTrigger();
  });
});

const section = (questType: QuestType, completed: boolean): QuestSection => ({
  questType,
  rows: [
    {
      completed,
      displayName: `${questType} craving`,
      id: `${questType}-craving`,
      kind: "craving",
      subtitle: "",
      villagerId: "adeline",
    } as unknown as QuestRow,
  ],
});

async function renderFinishedQuests() {
  vi.spyOn(questSections, "buildQuestSections").mockReturnValue([
    section("fetch", true),
    section("crown", false),
  ]);
  userState.toggleShowCompleted();
  const view = renderWithFeedback(AllPage, props);
  await tick();
  const completed = view.getByTestId("everything-completed");
  const finished = within(completed).getByRole("button", { name: "Quests" });
  await fireEvent.click(finished);
  await tick();
  return { completed, finished, view };
}

describe("locked quest sections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves a locked section out of the completed list", async () => {
    const { finished } = await renderFinishedQuests();
    const group = finished.closest("section");
    if (!group) throw new Error("Quests has no group");
    expect(within(group).queryByRole("button", { name: "Reveal spoiler" })).toBeNull();
    expect(within(group).getByRole("button", { name: /^Fetch Quests,/ })).toBeInTheDocument();
  });

  it("keeps a category outstanding when only its locked sections remain", async () => {
    const { completed, view } = await renderFinishedQuests();
    const outstanding = view
      .getAllByRole("button", { name: "Quests" })
      .find((button) => !completed.contains(button))
      ?.closest("section");
    if (!outstanding) throw new Error("Quests has no outstanding group");
    expect(within(outstanding).getAllByRole("button", { name: "Reveal spoiler" })).toHaveLength(1);
    expect(within(outstanding).queryByRole("button", { name: /^Fetch Quests,/ })).toBeNull();
  });
});

it("hides the Completed divider until a completed group has content", async () => {
  userState.toggleShowCompleted();
  const view = renderWithFeedback(AllPage, props);
  await tick();
  const completed = view.getByTestId("everything-completed");
  expect(completed.hidden).toBe(true);
  userState.setRenown(getMaxRenownLevel());
  await waitFor(
    () => {
      expect(completed.hidden).toBe(false);
    },
    { timeout: HOLD_TIMEOUT_MS },
  );
});
