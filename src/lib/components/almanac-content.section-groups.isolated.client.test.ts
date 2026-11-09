import { fireEvent, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import AlmanacContent from "#lib/components/almanac-content.svelte";
import { getAlmanacEntryNames, getName } from "#lib/data/names.js";
import { projectAlmanac } from "#lib/engine/projections/almanac.js";
import * as m from "#lib/paraglide/messages.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

// Finishing a section fires confetti, which needs a canvas happy-dom doesn't provide.
vi.mock("#lib/effects/celebrate.js", () => ({ celebrate: vi.fn(), celebrateCategory: vi.fn() }));

beforeEach(async () => {
  userState.resetAll();
  await userState.startTrackingByHand();
  toolbarState.closeSearch();
});

afterEach(() => {
  vi.useRealTimers();
});

it("moves a section finished by a row toggle under Completed once the row has left", async () => {
  userState.toggleShowSpoilers();
  const section = projectAlmanac(userState.progressContext, {
    progressionState: userState.progressionState,
  })
    .sections.filter(({ rows }) => rows.length >= 2 && rows.every(({ obtainable }) => obtainable))
    .filter(({ rows }) => rows.some(({ doable }) => doable))
    .toSorted((a, b) => a.rows.length - b.rows.length)
    .at(0);
  if (!section) throw new Error("Expected an Almanac section with several entries");
  const lastRow = section.rows.find(({ doable }) => doable);
  if (!lastRow) throw new Error("Expected the section to have rows");
  for (const { canonicalId } of section.rows) {
    if (canonicalId !== lastRow.canonicalId) userState.toggleAlmanacItem(canonicalId);
  }
  const sectionName = new RegExp(`^${RegExp.escape(getName("ui", section.id, "en"))},`);
  const lastRowName = getAlmanacEntryNames(lastRow.entry, "en")[0];

  renderWithFeedback(AlmanacContent, { locale: "en" });
  await fireEvent.click(await screen.findByRole("button", { name: sectionName }));
  const toggle = await screen.findByRole("button", { name: `Check ${lastRowName}` });

  vi.useFakeTimers();
  await fireEvent.click(toggle);
  await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 10);
  expect(
    screen.queryByRole("heading", { level: 2, name: m.common_completed_heading() }),
  ).toBeNull();

  await vi.advanceTimersByTimeAsync(10);
  const completedHeading = screen.getByRole("heading", {
    level: 2,
    name: m.common_completed_heading(),
  });
  await fireEvent.click(within(completedHeading).getByRole("button"));
  const sectionTrigger = screen.getByRole("button", { name: sectionName });
  expect(
    completedHeading.compareDocumentPosition(sectionTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(sectionTrigger).toHaveAttribute("aria-expanded", "true");
});
