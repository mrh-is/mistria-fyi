import { fireEvent, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import AlmanacContent from "#lib/components/almanac-content.svelte";
import { getAlmanacEntryNames, getName } from "#lib/data/names.js";
import { projectAlmanac } from "#lib/engine/projections/almanac.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

// Finishing a section fires confetti, which needs a canvas happy-dom doesn't provide.
vi.mock("#lib/effects/celebrate.js", () => ({ celebrate: vi.fn(), celebrateCategory: vi.fn() }));

beforeEach(() => {
  userState.resetAll();
  userState.setAvailabilityWindows(AVAILABILITY_WINDOWS);
  toolbarState.closeSearch();
});

afterEach(() => {
  vi.useRealTimers();
});

it("moves a section finished by a row toggle under Completed once the row has left", async () => {
  userState.toggleShowSpoilers();
  const section = projectAlmanac(userState.state, {
    progressionState: userState.progressionState,
  })
    .sections.filter(({ scopedRows, scopedTotal }) => scopedTotal >= 2 && scopedRows.length >= 2)
    .toSorted((a, b) => a.scopedTotal - b.scopedTotal)
    .at(0);
  if (!section) throw new Error("Expected an Almanac section with several entries");
  const lastRow = section.scopedRows.at(-1);
  if (!lastRow) throw new Error("Expected the section to have rows");
  for (const { canonicalId } of section.scopedRows.slice(0, -1)) {
    userState.toggleAlmanacItem(canonicalId);
  }
  const sectionName = new RegExp(`^${RegExp.escape(getName("ui", section.id, "en"))},`);
  const lastRowName = getAlmanacEntryNames(lastRow.entry, "en")[0];

  renderWithFeedback(AlmanacContent, { locale: "en" });
  await fireEvent.click(await screen.findByRole("button", { name: sectionName }));
  const toggle = await screen.findByRole("button", { name: `Check ${lastRowName}` });

  vi.useFakeTimers();
  await fireEvent.click(toggle);
  await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 10);
  expect(screen.queryByRole("heading", { name: "Completed" })).toBeNull();

  await vi.advanceTimersByTimeAsync(10);
  const completedHeading = screen.getByRole("heading", { name: "Completed" });
  const sectionTrigger = screen.getByRole("button", { name: sectionName });
  expect(
    completedHeading.compareDocumentPosition(sectionTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(sectionTrigger).toHaveAttribute("aria-expanded", "true");
});
