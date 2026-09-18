import { describe, expect, it } from "vitest";

import {
  evaluateAvailabilityCondition,
  hasSelectiveSeasonCondition,
  simplifyAvailabilityCondition,
} from "../availability-condition";

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
      type: "all",
      conditions: [
        { type: "season", seasons: ["summer"] },
        { type: "weather", weathers: ["calm"] },
        { type: "time", start: 600, end: 1800 },
        { type: "minesLevel", floor: 20 },
        { type: "perkUnlocked", perkId: "green_thumb" as PerkId },
        { type: "quest", questId: "main_quest" as QuestId, state: "completed" },
        { type: "skillLevel", level: 10, skillId: "farming" as SkillId },
        { type: "heartLevel", level: 4, npcId: "adeline" as NpcId },
      ],
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
      type: "all",
      conditions: [
        { type: "season", seasons: ["summer"] },
        {
          type: "any",
          conditions: [
            { type: "season", seasons: ["spring"] },
            { type: "not", condition: { type: "weather", weathers: ["inclement"] } },
          ],
        },
      ],
    };

    expect(evaluateAvailabilityCondition(condition, summer)).toBe(true);
  });

  it("uses Kleene logic for unknown predicates", () => {
    const unknown: AvailabilityCondition = {
      type: "gamePredicate",
      predicate: "unmodeled_requirement",
      value: { flags: ["x"] },
    };

    expect(evaluateAvailabilityCondition(unknown, {})).toBe("unknown");
    expect(
      evaluateAvailabilityCondition({ type: "all", conditions: [{ type: "always" }, unknown] }, {}),
    ).toBe("unknown");
    expect(
      evaluateAvailabilityCondition({ type: "any", conditions: [{ type: "always" }, unknown] }, {}),
    ).toBe(true);
    expect(
      evaluateAvailabilityCondition(
        {
          type: "any",
          conditions: [{ type: "not", condition: { type: "always" } }, unknown],
        },
        {},
      ),
    ).toBe("unknown");
  });

  it("returns unknown when a supplied quest-state map lacks the quest", () => {
    expect(
      evaluateAvailabilityCondition(
        { type: "quest", questId: "main_quest" as QuestId, state: "completed" },
        { questStates: new Map() },
      ),
    ).toBe("unknown");
  });
});

describe("simplifyAvailabilityCondition", () => {
  it("removes tautologies and flattens nested Boolean nodes", () => {
    const condition: AvailabilityCondition = {
      type: "all",
      conditions: [
        { type: "always" },
        {
          type: "all",
          conditions: [{ type: "always" }, { type: "season", seasons: ["summer"] }],
        },
      ],
    };

    expect(simplifyAvailabilityCondition(condition)).toEqual({
      type: "season",
      seasons: ["summer"],
    });
  });

  it("simplifies an any branch containing always", () => {
    expect(
      simplifyAvailabilityCondition({
        type: "any",
        conditions: [{ type: "always" }, { type: "season", seasons: ["summer"] }],
      }),
    ).toBeUndefined();
  });

  it("preserves missing-season evaluation when simplifying a year-round season", () => {
    const condition: AvailabilityCondition = {
      type: "season",
      seasons: ["spring", "summer", "fall", "winter"],
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
        type: "not",
        condition: {
          type: "any",
          conditions: [{ type: "always" }, { type: "season", seasons: ["summer"] }],
        },
      }),
    ).toBe(false);
  });

  it("finds a selective season through a not node", () => {
    expect(
      hasSelectiveSeasonCondition({
        type: "not",
        condition: { type: "season", seasons: ["winter"] },
      }),
    ).toBe(true);
  });

  it("does not treat a year-round season as selective", () => {
    expect(
      hasSelectiveSeasonCondition({
        type: "season",
        seasons: ["spring", "summer", "fall", "winter"],
      }),
    ).toBe(false);
  });
});
