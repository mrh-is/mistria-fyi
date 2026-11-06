import { describe, expect, it } from "vitest";

import { parseFiddle } from "../parse/parse-fiddle.js";
import { requireGameAssetsDir, stubLocalizer } from "../test-helpers.js";
import { buildCutsceneQuestMap } from "./cutscene-quest-map.js";
import { assignQuestRequirements } from "./quest-requirements.js";
import { extractQuests } from "./quests.js";
import { extractRecipes } from "./recipes.js";

import type { QuestId } from "#lib/types/tracker-data.js";

describe("quest requirements — real assets", () => {
  it("records every quest's start gates separately from its stages", () => {
    const fiddle = parseFiddle(requireGameAssetsDir()).data;
    const { recipeIdByItemId } = extractRecipes(fiddle);
    const { quests } = extractQuests(fiddle, stubLocalizer(), recipeIdByItemId);
    assignQuestRequirements(fiddle, quests, buildCutsceneQuestMap(fiddle));
    const all = Object.values(quests).flatMap((group) => Object.values(group));
    expect(all.length).toBeGreaterThan(200);
    for (const quest of all) expect(quest.requirements).toBeDefined();
    expect(quests.fetch["request_for_berries" as QuestId].requirements?.start).toEqual({
      type: "season",
      seasons: ["spring"],
    });
    expect(quests.fetch["request_for_catfish" as QuestId].requirements?.start).toEqual({
      type: "all",
      conditions: [
        { type: "skillLevel", level: 2, skillId: "fishing" },
        { type: "season", seasons: ["spring"] },
      ],
    });
    const mill = quests.story["repair_the_mill" as QuestId].requirements?.start;
    expect(mill?.type).toBe("all");
    if (mill?.type !== "all") throw new Error("Missing mill start gates");
    expect(mill.conditions).toContainEqual({
      type: "quest",
      questId: "replenishing_mistrias_food_reserves_1",
      state: "completed",
    });
    expect(quests.story["find_the_weathervane" as QuestId].requirements?.start).toBeDefined();
  });
});
