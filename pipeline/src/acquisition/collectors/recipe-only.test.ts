import { describe, expect, it } from "vitest";

import { PipelineDiagnostics } from "../../diagnostics.js";
import { makeFiddle } from "../../test-helpers.js";
import { RecipeSourceAccumulator } from "../source-accumulator.js";
import { collectRecipeOnlySources } from "./recipe-only.js";

import type { ItemId, PerkId, RecipeId } from "#lib/types/tracker-data.js";

describe("reviewed recipe acquisition", () => {
  it("fails when the native accumulator already encodes a reviewed perk", () => {
    const sources = new RecipeSourceAccumulator();
    const recipeId = "big_bell" as RecipeId;
    sources.add(recipeId, { type: "perk", perkId: "the_bell_tolls" as PerkId });
    const fiddle = makeFiddle({ items: { furniture: { test: { big_bell: { recipe: [] } } } } });
    expect(() => {
      collectRecipeOnlySources(fiddle, {
        diagnostics: new PipelineDiagnostics(),
        knownRecipeIds: new Set([recipeId]),
        recipeIdByItemId: new Map([["big_bell" as ItemId, recipeId]]),
        sources,
      });
    }).toThrow("Obsolete reviewed recipe source");
  });
});
