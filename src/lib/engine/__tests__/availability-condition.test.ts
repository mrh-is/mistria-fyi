import { describe, expect, it } from "vitest";

import {
  evaluateAvailabilityCondition,
  hasSelectiveSeasonCondition,
  simplifyAvailabilityCondition,
} from "../availability-condition.js";

import type { AvailabilityCondition, PerkId, QuestId, SkillId } from "$lib/types/tracker-data.js";

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
        { level: 4, npcId: "adeline" as never, type: "heartLevel" },
      ],
      type: "all",
    };

    expect(
      evaluateAvailabilityCondition(condition, {
        ...summer,
        heartLevels: new Map([["adeline" as never, 4]]),
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
});

describe("hasSelectiveSeasonCondition", () => {
  it("finds selective seasons through Boolean nodes", () => {
    expect(
      hasSelectiveSeasonCondition({
        condition: {
          conditions: [{ type: "always" }, { seasons: ["summer"], type: "season" }],
          type: "any",
        },
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
