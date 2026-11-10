import { fireEvent, screen, within } from "@testing-library/svelte";
import { beforeEach, expect, it, vi } from "vitest";

import MinesContent from "#lib/components/mines-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
import { showUndoToast } from "#lib/effects/undo-toast.js";
import { getMaxMineFloor } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import * as m from "#lib/ui-messages/messages.js";
import { recordKeys } from "#lib/utils/record.js";

// Confetti needs a canvas happy-dom doesn't provide, and the toast's undo is called directly.
vi.mock("#lib/effects/celebrate.js", () => ({ celebrate: vi.fn(), celebrateCategory: vi.fn() }));
vi.mock("#lib/effects/undo-toast.js", () => ({ showUndoToast: vi.fn() }));

const spellIds = recordKeys(trackerData.mines.spells);
const lastSpell = spellIds[0];
const lastSpellName = getName("spells", lastSpell, "en");

beforeEach(async () => {
  userState.resetAll();
  await userState.startTrackingByHand();
  userState.toggleShowSpoilers();
  userState.setMineFloor(getMaxMineFloor());
  for (const id of spellIds) if (id !== lastSpell) userState.toggleSpell(id);
  vi.mocked(celebrate).mockClear();
  vi.mocked(celebrateCategory).mockClear();
  vi.mocked(showUndoToast).mockClear();
});

function lastUndo(): () => void {
  const undo = vi.mocked(showUndoToast).mock.lastCall?.[2];
  if (!undo) throw new Error("Expected an undo toast");
  return undo;
}

it("finishing the category fires only the category burst, not the section one too", async () => {
  renderWithFeedback(MinesContent, { defaultOpen: true, locale: "en" });
  await fireEvent.click(await screen.findByRole("button", { name: `Check ${lastSpellName}` }));

  expect(celebrateCategory).toHaveBeenCalledTimes(1);
  expect(celebrate).not.toHaveBeenCalled();
});

it("undoing an untick doesn't celebrate", async () => {
  userState.toggleSpell(lastSpell);
  renderWithFeedback(MinesContent, { defaultOpen: true, locale: "en" });
  // Every finished list sits under a closed Completed shelf.
  const completedHeadings = await screen.findAllByRole("heading", {
    name: m.common_completed_heading(),
  });
  await Promise.all(
    completedHeadings.map((heading) => fireEvent.click(within(heading).getByRole("button"))),
  );
  await fireEvent.click(await screen.findByRole("button", { name: `Uncheck ${lastSpellName}` }));
  expect(userState.state.progress.spells.has(lastSpell)).toBe(false);

  lastUndo()();

  expect(userState.state.progress.spells.has(lastSpell)).toBe(true);
  expect(celebrateCategory).not.toHaveBeenCalled();
  expect(celebrate).not.toHaveBeenCalled();
});
