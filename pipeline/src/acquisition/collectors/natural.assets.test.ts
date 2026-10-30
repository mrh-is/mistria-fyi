import { assert, describe, expect, it } from "vitest";

import { classifyItemAvailability, classifySourceAvailability } from "#lib/engine/availability.js";

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
  RecipeSourceAccumulator,
} from "../source-accumulator.js";
import { collectNaturalSources } from "./natural.js";
import { collectStoreSources } from "./stores.js";

import type { RowWindowContext } from "#lib/engine/availability.js";
import type { ItemId, QuestId } from "#lib/types/tracker-data.js";

describe("crop acquisition with real assets", () => {
  it("gives every seeded crop a seasonal route and a quest-gated greenhouse route", () => {
    const { data: fiddle } = parseFiddle(requireGameAssetsDir());
    evaluateExpressions(fiddle);
    const items = new ItemSourceAccumulator();
    collectNaturalSources(fiddle, items, undefined, undefined, new PipelineDiagnostics());
    const crops = items
      .entries()
      .flatMap(([, sources]) => sources.filter((source) => source.type === "crop"));
    expect(crops.filter((source) => !source.greenhouse)).toHaveLength(55);
    expect(crops.filter((source) => source.greenhouse)).toHaveLength(55);
    expect(
      crops
        .filter((source) => !source.greenhouse && !source.availability)
        .map((source) => source.seedItemId)
        .toSorted(),
    ).toEqual(["seed_mystery_bag", "seed_temple_flower"]);
    const outdoor = crops.filter((source) => !source.greenhouse && source.availability);
    expect(outdoor).toHaveLength(53);
    for (const source of outdoor) {
      expect(source.availability).toEqual({
        type: "season",
        seasons: [expect.stringMatching(/^(spring|summer|fall|winter)$/)],
      });
    }
    const greenhouses = crops.filter((source) => source.greenhouse);
    for (const source of greenhouses) {
      expect(source.availability).toEqual({
        type: "quest",
        questId: "upgrade_the_carpenters_shop",
        state: "completed",
      });
    }

    // The only numeric seasons value is the default's required-field placeholder.
    const prototypes = (fiddle.object_prototypes as { crop: Record<string, { seasons: unknown }> })
      .crop;
    expect(
      Object.entries(prototypes).filter(([, crop]) => typeof crop.seasons === "number"),
    ).toEqual([["default", expect.objectContaining({ seasons: -1 })]]);
    expect(Object.values(prototypes).some((crop) => Array.isArray(crop.seasons))).toBe(true);

    const quests = fiddle.quests as { story_quests: Record<string, { rewards: unknown[] }> };
    expect(quests.story_quests.upgrade_the_carpenters_shop.rewards).toContainEqual({
      item: "small_greenhouse_white_blueprint",
    });

    const carrot = items.get("carrot" as ItemId);
    expect(carrot).toHaveLength(2);
    const seasonal = carrot.find((source) => source.type === "crop" && !source.greenhouse);
    const greenhouse = carrot.find((source) => source.type === "crop" && source.greenhouse);
    assert(seasonal);
    assert(greenhouse);
    const ctx: RowWindowContext = {
      progressionState: {
        hasUpperFloor: false,
        heartLevels: {},
        isDating: false,
        knownVillagers: new Set(),
        marriedVillager: null,
        mineFloor: 0,
        questVisibility: { ["upgrade_the_carpenters_shop" as QuestId]: "unavailable" },
        reachedSeason: "spring",
        renown: 0,
        showSpoilers: false,
        skillLevels: {},
        unlockedPerks: new Set(),
      },
      worldState: { season: "spring", weather: "calm" },
    };
    expect(classifySourceAvailability(seasonal, ctx)).toBe("now");
    expect(classifySourceAvailability(greenhouse, ctx)).toBe("later");
    expect(classifyItemAvailability({ sources: carrot }, ctx)).toBe("now");
    ctx.worldState.season = "summer";
    expect(classifyItemAvailability({ sources: carrot }, ctx)).toBe("later");
    ctx.progressionState.questVisibility["upgrade_the_carpenters_shop" as QuestId] = "completed";
    expect(classifySourceAvailability(greenhouse, ctx)).toBe("anytime");
    expect(classifyItemAvailability({ sources: carrot }, ctx)).toBe("anytime");

    // Balor's rotating crop & seed stock is already collected without a season restriction.
    collectStoreSources(
      fiddle,
      createRequirementContext(
        fiddle.requirements as Record<string, unknown>,
        buildCutsceneQuestMap(fiddle),
      ),
      items,
      new CosmeticSourceAccumulator(),
      new AnimalCosmeticSourceAccumulator(),
      {
        diagnostics: new PipelineDiagnostics(),
        knownRecipeIds: new Set(),
        recipeIdByItemId: new Map(),
        sources: new RecipeSourceAccumulator(),
      },
    );
    for (const itemId of ["carrot", "seed_carrot"]) {
      const balor = items
        .get(itemId as ItemId)
        .filter((source) => source.type === "store" && source.storeId === "balor");
      expect(balor).toHaveLength(1);
      expect(balor[0]).toMatchObject({
        availability: {
          type: "quest",
          questId: itemId === "carrot" ? "repair_the_general_store" : "upgrade_the_carpenters_shop",
          state: "completed",
        },
      });
    }
    ctx.progressionState.questVisibility["repair_the_general_store" as QuestId] = "completed";
    expect(classifyItemAvailability({ sources: items.get("carrot" as ItemId) }, ctx)).toBe(
      "anytime",
    );
  });
});
