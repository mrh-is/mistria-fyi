import { describe, expect, it } from "vitest";

import {
  evaluateAvailabilityCondition,
  hasSelectiveSeasonCondition,
  simplifyAvailabilityCondition,
} from "../availability-condition.js";

import type {
  AvailabilityCondition,
  NpcId,
  PerkId,
  QuestId,
  SkillId,
} from "$lib/types/tracker-data.js";

const summer = { season: "summer" as const, weather: "calm" as const };

describe("evaluateAvailabilityCondition", () => {
  it("evaluates always as true", () => {
    expect(evaluateAvailabilityCondition({ type: "always" }, {})).toBe(true);
  });

  it("evaluates supported leaves from supplied world state", () => {
    const condition: AvailabilityCondition = {
      conditions: [
        { seasons: ["summer"], type: "season" },
        { type: "weather", weathers: ["calm"] },
        { start: 600, end: 1800, type: "time" },
        { floor: 20, type: "minesLevel" },
        { perkId: "green_thumb" as PerkId, type: "perkUnlocked" },
        { questId: "main_quest" as QuestId, state: "completed", type: "quest" },
        { level: 10, skillId: "farming" as SkillId, type: "skillLevel" },
        { level: 4, npcId: "adeline" as NpcId, type: "heartLevel" },
      ],
      type: "all",
    };

    expect(
      evaluateAvailabilityCondition(condition, {
        ...summer,
        heartLevels: new Map([["adeline" as NpcId, 4]]),
        minesLevel: 20,
        perkIds: new Set(["green_thumb" as PerkId]),
        questStates: new Map([["main_quest" as QuestId, "completed"]]),
        skillLevels: new Map([["farming" as SkillId, 10]]),
        time: 1200,
      }),
    ).toBe(true);
  });

  it("preserves nested all, any, and not logic", () => {
    const condition: AvailabilityCondition = {
      conditions: [
        { seasons: ["summer"], type: "season" },
        {
          conditions: [
            { seasons: ["spring"], type: "season" },
            { condition: { type: "weather", weathers: ["inclement"] }, type: "not" },
          ],
          type: "any",
        },
      ],
      type: "all",
    };

    expect(evaluateAvailabilityCondition(condition, summer)).toBe(true);
  });

  it("uses Kleene logic for unknown predicates", () => {
    const unknown: AvailabilityCondition = {
      predicate: "unmodeled_requirement",
      type: "gamePredicate",
      value: { flags: ["x"] },
    };

    expect(evaluateAvailabilityCondition(unknown, {})).toBe("unknown");
    expect(
      evaluateAvailabilityCondition({ conditions: [{ type: "always" }, unknown], type: "all" }, {}),
    ).toBe("unknown");
    expect(
      evaluateAvailabilityCondition({ conditions: [{ type: "always" }, unknown], type: "any" }, {}),
    ).toBe(true);
    expect(
      evaluateAvailabilityCondition(
        {
          conditions: [{ condition: { type: "always" }, type: "not" }, unknown],
          type: "any",
        },
        {},
      ),
    ).toBe("unknown");
  });

  it("returns unknown when a supplied quest-state map lacks the quest", () => {
    expect(
      evaluateAvailabilityCondition(
        { questId: "main_quest" as QuestId, state: "completed", type: "quest" },
        { questStates: new Map() },
      ),
    ).toBe("unknown");
  });
});

describe("simplifyAvailabilityCondition", () => {
  it("removes tautologies and flattens nested Boolean nodes", () => {
    const condition: AvailabilityCondition = {
      conditions: [
        { type: "always" },
        {
          conditions: [{ type: "always" }, { seasons: ["summer"], type: "season" }],
          type: "all",
        },
      ],
      type: "all",
    };

    expect(simplifyAvailabilityCondition(condition)).toEqual({
      seasons: ["summer"],
      type: "season",
    });
  });

  it("simplifies an any branch containing always", () => {
    expect(
      simplifyAvailabilityCondition({
        conditions: [{ type: "always" }, { seasons: ["summer"], type: "season" }],
        type: "any",
      }),
    ).toEqual({ type: "always" });
  });

  it("preserves missing-season evaluation when simplifying a year-round season", () => {
    const condition: AvailabilityCondition = {
      seasons: ["spring", "summer", "fall", "winter"],
      type: "season",
    };

    expect(evaluateAvailabilityCondition(condition, {})).toBe("unknown");
    expect(evaluateAvailabilityCondition(simplifyAvailabilityCondition(condition), {})).toBe(
      "unknown",
    );
  });
});

describe("hasSelectiveSeasonCondition", () => {
  it("ignores selective seasons in a branch simplified to always", () => {
    expect(
      hasSelectiveSeasonCondition({
        condition: {
          conditions: [{ type: "always" }, { seasons: ["summer"], type: "season" }],
          type: "any",
        },
        type: "not",
      }),
    ).toBe(false);
  });

  it("finds a selective season through a not node", () => {
    expect(
      hasSelectiveSeasonCondition({
        condition: { seasons: ["winter"], type: "season" },
        type: "not",
      }),
    ).toBe(true);
  });

  it("does not treat a year-round season as selective", () => {
    expect(
      hasSelectiveSeasonCondition({
        seasons: ["spring", "summer", "fall", "winter"],
        type: "season",
      }),
    ).toBe(false);
  });
});
