import { describe, expect, it } from "vitest";

import { PipelineDiagnostics } from "../../diagnostics.js";
import { buildCutsceneQuestMap } from "../../extract/cutscene-quest-map.js";
import { evaluateExpressions } from "../../parse/evaluate.js";
import { parseFiddle } from "../../parse/parse-fiddle.js";
import { createRequirementContext } from "../../parse/requirements.js";
import { requireGameAssetsDir } from "../../test-helpers.js";
import {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
  RecipeSourceAccumulator,
} from "../source-accumulator.js";
import { collectRewardSources } from "./rewards.js";

import type { ItemId } from "#lib/types/tracker-data.js";

describe("letter acquisition — v1.0.5 assets", () => {
  it("keeps the birthday and heart gates on Temple Flower Seeds", () => {
    const { data: fiddle } = parseFiddle(requireGameAssetsDir());
    evaluateExpressions(fiddle);
    const items = new ItemSourceAccumulator();
    const cutsceneMap = buildCutsceneQuestMap(fiddle);
    collectRewardSources(
      fiddle,
      items,
      new CosmeticSourceAccumulator(),
      new AnimalCosmeticSourceAccumulator(),
      new PetCosmeticSourceAccumulator(),
      {
        diagnostics: new PipelineDiagnostics(),
        knownRecipeIds: new Set(),
        recipeIdByItemId: new Map(),
        sources: new RecipeSourceAccumulator(),
      },
      createRequirementContext(
        fiddle.requirements as Record<string, unknown> | undefined,
        cutsceneMap,
      ),
    );
    const sources = items.get("seed_temple_flower" as ItemId);
    expect(sources.some((source) => source.type === "reach_day")).toBe(false);
    const birthday = sources.find(
      (source) => source.type === "letter" && source.letterId === "ari_birthday_celine_best_friend",
    );
    expect(birthday?.type).toBe("letter");
    if (birthday?.type !== "letter") throw new Error("Expected birthday letter source");
    expect(birthday.trigger).toBe("birthday");
    expect(birthday.availability?.type).toBe("all");
    expect(JSON.stringify(birthday?.availability)).toContain('"is_player_birthday"');
    expect(JSON.stringify(birthday?.availability)).toContain('"heartLevel"');
    expect(JSON.stringify(birthday?.availability)).toContain('"world_fact_is"');
  });
});
