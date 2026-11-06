import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { recipeSections } from "#lib/presentation/recipe-sections.js";
import { recordKeys } from "#lib/utils/record.js";

describe("recipeSections", () => {
  it("places every counted recipe on the page", () => {
    const placed = new Set(
      recipeSections().flatMap(({ recipes }) => recipes.map(({ recipeId }) => recipeId)),
    );
    const missing = recordKeys(trackerData.recipes)
      .filter((id) => !placed.has(id))
      .map((id) => getName("recipes", id, "en"));

    expect(missing).toEqual([]);
  });
});
