import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, it } from "vitest";

import SkillRecordHarness from "#lib/components/skill-record.test-harness.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName, loadNames } from "#lib/data/names.js";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordKeys } from "#lib/utils/record.js";

import type { SkillId } from "#lib/types/tracker-data.js";

const id = "mining" as SkillId;
const tiers = trackerData.skills[id].perkTiers.map((tier, index) => ({
  ids: recordKeys(tier),
  level: trackerData.perkTierLevels[index],
}));
const firstName = getName("perks", tiers[0].ids[0], "en");
const lastName = getName("perks", tiers[4].ids[0], "en");

beforeEach(async () => {
  await userState.startTrackingByHand();
});

it("registers feedback metadata and opens the right tiers on keyboard and button edits", async () => {
  const feedbackContext = new FeedbackContext();
  const view = render(SkillRecordHarness, { feedbackContext, id, name: "Mining" });
  await waitFor(() => {
    expect(feedbackContext.registrations.size).toBe(1);
  });
  expect([...feedbackContext.registrations.values()][0]).toMatchObject({
    category: "skill",
    displayName: "Mining",
    entityId: "mining",
    extra: { level: 0 },
  });
  const ruler = screen.getByRole("slider", { name: "Mining level" });
  const decrease = screen.getByRole("button", { name: "Decrease Mining level" });
  const increase = screen.getByRole("button", { name: "Increase Mining level" });
  expect(ruler).toHaveAttribute("aria-valuetext", "Mining, level 0 of 60");
  expect(decrease).toBeDisabled();
  expect(screen.queryByText(firstName)).toBeNull();

  await fireEvent.click(increase);
  expect(ruler).toHaveAttribute("aria-valuenow", "1");
  expect(screen.getByText(firstName)).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: "Reached" })).toHaveLength(tiers[0].ids.length);
  expect(screen.queryByText(lastName)).toBeNull();

  await fireEvent.keyDown(ruler, { key: "PageUp" });
  expect(ruler).toHaveAttribute("aria-valuenow", "16");
  await fireEvent.keyDown(ruler, { key: "End" });
  expect(increase).toBeDisabled();
  expect(screen.getByText(lastName)).toBeInTheDocument();
  await fireEvent.keyDown(ruler, { key: "Home" });
  expect(decrease).toBeDisabled();
  expect(screen.queryByText(firstName)).toBeNull();

  view.unmount();
  expect(feedbackContext.registrations.size).toBe(0);
});

it("prints localized perk names when spoiler covers are off", async () => {
  await loadNames("ru", ["perks", "ui"]);
  userState.toggleShowSpoilers();
  try {
    render(SkillRecordHarness, {
      feedbackContext: new FeedbackContext(),
      id,
      locale: "ru",
      name: "Mining",
    });
    expect(screen.getByText(getName("perks", tiers[4].ids[0], "ru"))).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Unreached" })).toHaveLength(
      tiers.reduce((count, tier) => count + tier.ids.length, 0),
    );
  } finally {
    userState.toggleShowSpoilers();
  }
});
