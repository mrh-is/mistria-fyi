import { fireEvent, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import AnimalsContent from "#lib/components/animals-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

// Finishing a section fires confetti, which needs a canvas happy-dom doesn't provide.
vi.mock("#lib/effects/celebrate.js", () => ({ celebrate: vi.fn(), celebrateCategory: vi.fn() }));

beforeEach(() => {
  userState.resetAll();
  toolbarState.closeSearch();
});

afterEach(() => {
  vi.useRealTimers();
});

// The mount section holds its group through the section context rather than the page's toggles.
it("holds a sub-section finished by a row toggle, then moves it under Completed", async () => {
  userState.toggleShowSpoilers();
  // Finished rows stay listed, so the finished section keeps rendering & can move.
  userState.toggleShowCompleted();
  const appearanceIds = recordKeys(trackerData.mount.appearances).toSorted((a, b) =>
    nameCollator("en").compare(getName("mount", a, "en"), getName("mount", b, "en")),
  );
  const lastId = appearanceIds.at(-1);
  if (!lastId) throw new Error("Expected mount appearances");
  for (const id of appearanceIds.slice(0, -1)) userState.toggleMountAppearance(id);
  for (const id of recordKeys(trackerData.mount.perks)) userState.togglePerk(id);
  const mountName = new RegExp(`^${RegExp.escape(getName("ui", "mount", "en"))},`);

  renderWithFeedback(AnimalsContent, { locale: "en" });
  await fireEvent.click(await screen.findByRole("button", { name: mountName }));
  await fireEvent.click(screen.getByRole("button", { name: /^Appearances,/ }));
  const toggle = await screen.findByRole("button", {
    name: `Check ${getName("mount", lastId, "en")}`,
  });

  vi.useFakeTimers();
  await fireEvent.click(toggle);
  await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 10);
  expect(screen.queryByRole("heading", { name: "Completed" })).toBeNull();

  await vi.advanceTimersByTimeAsync(10);
  const completedHeading = screen.getByRole("heading", { name: "Completed" });
  const mountTrigger = screen.getByRole("button", { name: mountName });
  const petSkinsTrigger = screen.getByRole("button", { name: /^Pet skins,/ });
  expect(
    petSkinsTrigger.compareDocumentPosition(completedHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    completedHeading.compareDocumentPosition(mountTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(mountTrigger).toHaveAttribute("aria-expanded", "true");
});
