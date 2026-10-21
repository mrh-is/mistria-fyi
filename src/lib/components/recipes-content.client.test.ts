import { beforeEach, describe, expect, it } from "vitest";

import RecipesContent from "#lib/components/recipes-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordValues } from "#lib/utils/record.js";

import type { ItemId } from "#lib/types/tracker-data.js";

describe("RecipesContent", () => {
  beforeEach(() => {
    userState.resetAll();
    toolbarState.closeSearch();
  });

  it("drops a spoilered recipe matched by name", () => {
    const itemId = findRecipeItem(true);
    const name = getName("items", itemId, "en");
    toolbarState.setSearchQuery(name);

    const view = renderWithFeedback(RecipesContent, { locale: "en" });

    expect(view.queryByText(name)).not.toBeInTheDocument();
  });

  it("shows an unspoilered recipe matched by name", async () => {
    const itemId = findRecipeItem(false);
    const name = getName("items", itemId, "en");
    toolbarState.setSearchQuery(name);

    const view = renderWithFeedback(RecipesContent, { locale: "en" });

    expect(await view.findByText(name)).toBeInTheDocument();
  });
});

function findRecipeItem(spoilered: boolean): ItemId {
  for (const category of recordValues(trackerData.almanac)) {
    for (const { itemIds } of category.items) {
      const recipeId = trackerData.items[itemIds[0]].sources.find(
        (source) => source.type === "recipe",
      )?.recipeId;
      if (!recipeId) continue;
      const visible = isConditionVisible(
        trackerData.recipes[recipeId].visibility,
        userState.progressionState,
      );
      if (visible !== spoilered) return itemIds[0];
    }
  }
  throw new Error(`Expected a ${spoilered ? "spoilered" : "visible"} recipe`);
}
