import { fireEvent, screen } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";

import QuestsContent from "#lib/components/quests-content.svelte";
import { showQuestToast } from "#lib/effects/undo-toast.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import type { QuestId, RecipeId } from "#lib/types/tracker-data.js";

const questId = "bell_berry_bakewell_tart_challenge" as QuestId;
const recipeId = "kitchen_herb_planter" as RecipeId;
const name = "Bell Berry Bakewell Tart Challenge";

vi.mock("#lib/effects/celebrate.js", () => ({ celebrate: vi.fn(), celebrateCategory: vi.fn() }));
vi.mock("#lib/effects/undo-toast.js", () => ({ showQuestToast: vi.fn() }));
vi.mock("#lib/presentation/quest-sections.js", () => ({
  buildQuestSections: () => [
    {
      questType: "story",
      rows: [
        {
          displayName: name,
          id: questId,
          kind: "quest",
          sources: [],
          visibility: { type: "hasUpperFloor" },
        },
      ],
    },
  ],
}));

afterEach(() => {
  userState.resetAll();
  vi.clearAllMocks();
});

it("confirms a spoilered quest and undoes its completion and recipe reward", async () => {
  await userState.startTrackingByHand();
  renderWithFeedback(QuestsContent, { locale: "en" });
  await fireEvent.click(await screen.findByRole("button", { name: /^Story Quests,/i }));
  const toggle = await screen.findByRole("button", { name: "Check spoilered item" });
  expect(userState.state.progress.almanacRecipes.has(recipeId)).toBe(false);

  await fireEvent.click(toggle);

  expect(userState.state.progress.questStates[questId] ?? "none").toBe("none");
  expect(showQuestToast).not.toHaveBeenCalled();
  await fireEvent.click(await screen.findByRole("button", { name: "YOLO (just this one thing)" }));
  expect(userState.state.progress.questStates[questId]).toBe("obtained");

  await fireEvent.click(await screen.findByRole("button", { name: "Check spoilered item" }));

  expect(userState.state.progress.questStates[questId]).toBe("completed");
  expect(userState.state.progress.almanacRecipes.has(recipeId)).toBe(true);
  expect(showQuestToast).toHaveBeenLastCalledWith(
    name,
    "completed",
    [recipeId],
    "en",
    expect.any(Function),
  );
  const undo = vi.mocked(showQuestToast).mock.lastCall?.[4];
  if (!undo) throw new Error("Expected the completion toast’s undo callback");
  undo();

  expect(userState.state.progress.questStates[questId]).toBe("obtained");
  expect(userState.state.progress.almanacRecipes.has(recipeId)).toBe(false);
});
