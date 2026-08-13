import { describe, expect, it } from "vitest";

import { resolveToVisibility, simplifyCondition } from "./requirement-resolver.js";

import type { RequirementExpression } from "../../requirements.js";
import type { CutsceneQuestMap } from "./cutscene-quest-map.js";

const emptyCutsceneMap: CutsceneQuestMap = {};

describe("resolveToVisibility", () => {
  it("maps seen_cutscene via cutscene-quest map to questCompleted", () => {
    const cutsceneMap: CutsceneQuestMap = {
      repair_the_inn_pt_2: { phase: "completed", questId: "repair_the_inn" as never },
    };
    const expr: RequirementExpression = {
      predicate: "seen_cutscene",
      value: "repair_the_inn_pt_2",
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      questId: "repair_the_inn",
      type: "questCompleted",
    });
  });

  it("maps seen_cutscene with quest_to_start to questAvailable", () => {
    const cutsceneMap: CutsceneQuestMap = {
      quest_start: { phase: "available", questId: "some_quest" as never },
    };
    const expr: RequirementExpression = {
      predicate: "seen_cutscene",
      value: "quest_start",
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      questId: "some_quest",
      type: "questAvailable",
    });
  });

  it("maps reached_skill_level to skillLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_skill_level",
      value: { farming: 30 },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      level: 30,
      skillId: "farming",
      type: "skillLevel",
    });
  });

  it("maps reached_mines_level to minesLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_mines_level",
      value: 41,
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      floor: 41,
      type: "minesLevel",
    });
  });

  it("maps completed_quest to questCompleted", () => {
    const expr: RequirementExpression = {
      predicate: "completed_quest",
      value: "repair_the_bridge",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      questId: "repair_the_bridge",
      type: "questCompleted",
    });
  });

  it("maps met_npc to npcKnown", () => {
    const expr: RequirementExpression = {
      predicate: "met_npc",
      value: "stillwell",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      npcId: "stillwell",
      type: "npcKnown",
    });
  });

  it("projects is_season to always", () => {
    const expr: RequirementExpression = {
      predicate: "is_season",
      value: "spring",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects is_day_type to always", () => {
    const expr: RequirementExpression = {
      predicate: "is_day_type",
      value: "saturday",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects reached_date to always", () => {
    const expr: RequirementExpression = {
      predicate: "reached_date",
      value: { day: 1, season: "spring" },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects acquired_item to always", () => {
    const expr: RequirementExpression = {
      predicate: "acquired_item",
      value: "copper_pickaxe",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects invert (not) to always", () => {
    const expr: RequirementExpression = {
      not: { predicate: "seen_cutscene", value: "some_cutscene" },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("resolves all (and) composition", () => {
    const cutsceneMap: CutsceneQuestMap = {
      repair_inn_pt_2: { phase: "completed", questId: "repair_the_inn" as never },
    };
    const expr: RequirementExpression = {
      all: [
        { predicate: "seen_cutscene", value: "repair_inn_pt_2" },
        { predicate: "reached_mines_level", value: 20 },
      ],
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      conditions: [
        { questId: "repair_the_inn", type: "questCompleted" },
        { floor: 20, type: "minesLevel" },
      ],
      type: "and",
    });
  });

  it("resolves any (or) composition", () => {
    const expr: RequirementExpression = {
      any: [
        { predicate: "completed_quest", value: "quest_a" },
        { predicate: "completed_quest", value: "quest_b" },
      ],
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      conditions: [
        { questId: "quest_a", type: "questCompleted" },
        { questId: "quest_b", type: "questCompleted" },
      ],
      type: "or",
    });
  });

  it("maps reached_heart_level to heartLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_heart_level",
      value: { ryis: 2 },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      level: 2,
      npcId: "ryis",
      type: "heartLevel",
    });
  });
});

describe("simplifyCondition", () => {
  it("drops always from and", () => {
    expect(
      simplifyCondition({
        conditions: [{ type: "always" }, { questId: "q" as never, type: "questCompleted" }],
        type: "and",
      }),
    ).toEqual({ questId: "q", type: "questCompleted" });
  });

  it("collapses or containing always to always", () => {
    expect(
      simplifyCondition({
        conditions: [{ type: "always" }, { questId: "q" as never, type: "questCompleted" }],
        type: "or",
      }),
    ).toEqual({ type: "always" });
  });

  it("collapses empty and to always", () => {
    expect(simplifyCondition({ conditions: [] as never, type: "and" })).toEqual({ type: "always" });
  });

  it("unwraps single-element and", () => {
    expect(
      simplifyCondition({
        conditions: [{ questId: "q" as never, type: "questCompleted" }],
        type: "and",
      }),
    ).toEqual({ questId: "q", type: "questCompleted" });
  });

  it("simplifies nested and-of-or with always", () => {
    expect(
      simplifyCondition({
        conditions: [
          {
            conditions: [{ type: "always" }, { questId: "q" as never, type: "questCompleted" }],
            type: "or",
          },
          { floor: 20, type: "minesLevel" },
        ],
        type: "and",
      }),
    ).toEqual({ floor: 20, type: "minesLevel" });
  });
});
