import { fireEvent, screen, within } from "@testing-library/svelte";
import { beforeEach, expect, it } from "vitest";

import RenownContent from "#lib/components/renown-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

beforeEach(async () => {
  userState.resetAll();
  await userState.startTrackingByHand();
  renderWithFeedback(RenownContent, { locale: "en" });
});

it("lists every reward and uses one tab stop in the reward grid", () => {
  const grid = screen.getByRole("grid");
  const cells = within(grid).getAllByRole("gridcell");
  expect(cells).toHaveLength(trackerData.renown.rewards.length);
  expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
  expect(
    within(screen.getByRole("list", { name: "All rewards" })).getAllByRole("listitem"),
  ).toHaveLength(cells.length);
});

it("selects a reward with arrows without changing recorded renown", async () => {
  const cell = screen.getByRole("gridcell", { name: /Level 1,/u });
  await fireEvent.keyDown(cell, { key: "ArrowRight" });
  expect(screen.getByRole("gridcell", { name: /Level 2,/u })).toHaveFocus();
  expect(userState.state.progress.renown).toBe(0);
});

it("sets renown with the keyboard and changes reached reward treatments", async () => {
  const slider = screen.getByRole("slider", { name: "Renown level" });
  await fireEvent.keyDown(slider, { key: "PageUp" });
  expect(slider).toHaveAttribute("aria-valuenow", "10");
  expect(screen.getByRole("gridcell", { name: /Level 10,/u })).toHaveAttribute(
    "data-reached",
    "true",
  );
  expect(screen.getByRole("gridcell", { name: /Level 11,/u })).toHaveAttribute(
    "data-reached",
    "false",
  );
});
