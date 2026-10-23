import { fireEvent, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import QuestsContent from "#lib/components/quests-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { extractSaveProgress } from "#lib/engine/import-save.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

describe("QuestsContent empty sections", () => {
  beforeEach(() => {
    userState.resetAll();
    userState.toggleShowSpoilers();
    toolbarState.closeSearch();
    toolbarState.resetSourceFilters();
  });

  // The `client` project shares stores across the files a worker runs, so leave spoilers off &
  // the toolbar closed for the next file.
  afterEach(() => {
    userState.resetAll();
    toolbarState.closeSearch();
    toolbarState.resetSourceFilters();
  });

  it("keeps completed sections' notes out from under incomplete sections after an import", async () => {
    // Synthetic late-game progress: Crown & Cooking are complete, while Story has quests left.
    const completedQuestIds = [
      ...recordKeys(trackerData.quests.crown),
      ...recordKeys(trackerData.quests.cooking),
      ...recordKeys(trackerData.quests.story).slice(0, 48),
    ];
    userState.mergeFromSave(
      extractSaveProgress({ quests: { completed_quests: completedQuestIds } }).completed,
    );
    const view = renderWithFeedback(QuestsContent, { locale: "en" });
    await tick();

    expect(view.container.querySelector("[data-tracker-empty]")).toBeNull();
    await fireEvent.click(view.getByRole("button", { name: /^Story Quests,/ }));
    const story = view.getByRole("button", { name: /^Story Quests,/ }).closest("section, .section");
    if (!story) throw new Error("Expected the Story section");
    expect(story.querySelectorAll("[data-tracker-row]")).toHaveLength(9);
    expect(story.querySelector("[data-tracker-empty]")).toBeNull();

    await fireEvent.click(view.getByRole("button", { name: /^Crown Requests,/ }));
    const crown = view.getByRole("button", { name: /^Crown Requests,/ }).closest(".section");
    if (!crown) throw new Error("Expected the Crown section");
    expect(within(crown as HTMLElement).getByText(/All done!/)).toBeInTheDocument();
    expect(crown.querySelectorAll("[data-tracker-row]")).toHaveLength(0);

    userState.toggleShowCompleted();
    await tick();
    // The Story section above takes the rows rendered at once; Crown's arrive over frames.
    await waitFor(() => {
      expect(crown.querySelectorAll("[data-tracker-row]")).toHaveLength(
        recordKeys(trackerData.quests.crown).length,
      );
    });
    expect(crown.querySelector("[data-tracker-empty]")).toBeNull();
  });

  it("keeps a filter-empty note inside the section whose sources were filtered out", async () => {
    const view = renderWithFeedback(QuestsContent, { locale: "en" });
    await tick();
    toolbarState.hideAllSourceFilters();
    await tick();

    expect(view.container.querySelector("[data-tracker-empty]")).toBeNull();
    await fireEvent.click(view.getByRole("button", { name: /^Fetch Quests,/ }));
    const fetch = view.getByRole("button", { name: /^Fetch Quests,/ }).closest(".section");
    if (!fetch) throw new Error("Expected the Fetch section");
    expect(
      within(fetch as HTMLElement).getByText("No items match the current filters"),
    ).toBeInTheDocument();
    expect(fetch.querySelectorAll("[data-tracker-row]")).toHaveLength(0);

    toolbarState.resetSourceFilters();
    await tick();
    expect(fetch.querySelectorAll("[data-tracker-row]").length).toBeGreaterThan(0);
    expect(fetch.querySelector("[data-tracker-empty]")).toBeNull();
  });
});
