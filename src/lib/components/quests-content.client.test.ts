import { fireEvent, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it } from "vitest";

import QuestsContent from "#lib/components/quests-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { extractSaveProgress } from "#lib/engine/import-save.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

it("labels the matching shelf without the unfiltered section's shelf heading", async () => {
  userState.setSeason("summer");
  const view = renderWithFeedback(QuestsContent, { locale: "en" });
  await tick();
  expect(view.getByRole("heading", { level: 2, name: "To do" })).toBeVisible();

  toolbarState.setSearchQuery("Berries");
  await tick();

  expect(view.getByRole("heading", { name: "Fetch quests" })).toBeVisible();
  const matches = within(view.getByRole("group", { name: "Not now" }));
  expect(matches.getByRole("heading", { level: 3, name: "Not now" })).toBeVisible();
  expect(matches.getAllByRole("button", { name: "Check Wild Berries" })).toHaveLength(3);
  expect(view.queryByRole("heading", { name: "To do" })).toBeNull();

  toolbarState.setSearchQuery("");
  await tick();
  expect(view.getByRole("heading", { level: 2, name: "To do" })).toBeVisible();
});

describe("QuestsContent empty sections", () => {
  beforeEach(async () => {
    await userState.startTrackingByHand();
    userState.toggleShowSpoilers();
  });

  // The `client` project shares stores across the files a worker runs, so leave spoilers off &
  // the toolbar closed for the next file.

  it("keeps completed sections' notes out from under incomplete sections after an import", async () => {
    // Synthetic late-game progress: Crown & Cooking are complete, while Story has quests left.
    const completedQuestIds = [
      ...recordKeys(trackerData.quests.crown),
      ...recordKeys(trackerData.quests.cooking),
      ...recordKeys(trackerData.quests.story).slice(0, 48),
    ];
    await userState.mergeFromSave(
      extractSaveProgress({ quests: { completed_quests: completedQuestIds } }).completed,
    );
    const view = renderWithFeedback(QuestsContent, { locale: "en" });
    await tick();

    expect(view.container.querySelector("[data-tracker-empty]")).toBeNull();
    await fireEvent.click(view.getByRole("button", { name: /^Story Quests,/ }));
    const story = view.getByRole("button", { name: /^Story Quests,/ }).closest("section, .section");
    if (!story) throw new Error("Expected the Story section");
    await fireEvent.click(within(story as HTMLElement).getByRole("button", { name: "Not now" }));
    await waitFor(() => {
      expect(story.querySelectorAll("[data-tracker-row]")).toHaveLength(9);
    });
    expect(story.querySelector("[data-tracker-empty]")).toBeNull();

    const pageFold = view.getByRole("heading", { level: 2, name: "Completed" });
    await fireEvent.click(within(pageFold).getByRole("button"));
    await fireEvent.click(view.getByRole("button", { name: /^Crown Requests,/ }));
    const crown = view.getByRole("button", { name: /^Crown Requests,/ }).closest(".section");
    if (!crown) throw new Error("Expected the Crown section");
    await tick();
    // The Story section above takes the rows rendered at once; Crown's arrive over frames.
    await waitFor(() => {
      expect(crown.querySelectorAll("[data-tracker-row]")).toHaveLength(
        recordKeys(trackerData.quests.crown).length,
      );
    });
    expect(crown.querySelector("[data-tracker-empty]")).toBeNull();
  });

  it("takes a section off the page while filters hide all its sources", async () => {
    const view = renderWithFeedback(QuestsContent, { locale: "en" });
    await tick();
    expect(view.getByRole("button", { name: /^Fetch quests,/ })).toBeInTheDocument();

    toolbarState.hideAllSourceFilters();
    await tick();
    expect(view.queryByRole("button", { name: /^Fetch quests,/ })).toBeNull();

    toolbarState.resetSourceFilters();
    await tick();
    expect(view.getByRole("button", { name: /^Fetch quests,/ })).toBeInTheDocument();
  });
});
