import { describe, expect, it } from "vitest";

import { availabilityToVisibility, toAvailableVisibility } from "./availability-projection";

import type { AvailabilityCondition } from "$lib/types/acquisition.js";
import type { QuestId } from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

describe("availabilityToVisibility", () => {
  it.each([
    [{ type: "always" }, { type: "always" }],
    [
      { type: "heartLevel", level: 4, npcId: "juniper" },
      { type: "heartLevel", level: 4, npcId: "juniper" },
    ],
    [
      { type: "minesLevel", floor: 40 },
      { type: "minesLevel", floor: 40 },
    ],
    [
      { type: "perkUnlocked", perkId: "espresso_yourself" },
      { type: "perkUnlocked", perkId: "espresso_yourself" },
    ],
    [
      { type: "quest", questId: "repair_the_bridge", state: "available" },
      { type: "questAvailable", questId: "repair_the_bridge" },
    ],
    [
      { type: "quest", questId: "repair_the_bridge", state: "completed" },
      { type: "questCompleted", questId: "repair_the_bridge" },
    ],
    [
      { type: "skillLevel", level: 15, skillId: "woodcrafting" },
      { type: "skillLevel", level: 15, skillId: "woodcrafting" },
    ],
  ] as const)("projects supported leaf %#", (availability, expected) => {
    expect(availabilityToVisibility(availability as AvailabilityCondition)).toEqual(expected);
  });

  it("projects and simplifies nested all and any conditions", () => {
    const condition: AvailabilityCondition = {
      type: "all",
      conditions: [
        { type: "always" },
        {
          type: "any",
          conditions: [
            { type: "minesLevel", floor: 20 },
            {
              type: "quest",
              questId: "find_the_magic_key" as QuestId,
              state: "completed",
            },
          ],
        },
      ],
    };

    expect(availabilityToVisibility(condition)).toEqual({
      type: "or",
      conditions: [
        { type: "minesLevel", floor: 20 },
        { type: "questCompleted", questId: "find_the_magic_key" },
      ],
    });
  });

  it.each([
    { type: "gamePredicate", predicate: "native_flag", value: true },
    { type: "not", condition: { type: "always" } },
    { type: "season", seasons: ["spring"] },
    { type: "time", start: 600, end: 1800 },
    { type: "weather", weathers: ["sunny"] },
  ] as const)("conservatively reveals unsupported condition %#", (condition) => {
    expect(availabilityToVisibility(condition as AvailabilityCondition)).toEqual({
      type: "always",
    });
  });

  it("conservatively reveals any condition with an unsupported branch", () => {
    expect(
      availabilityToVisibility({
        type: "any",
        conditions: [
          { type: "minesLevel", floor: 20 },
          { type: "season", seasons: ["spring"] },
        ],
      }),
    ).toEqual({ type: "always" });
  });

  it("defaults missing availability to always", () => {
    expect(availabilityToVisibility()).toEqual({ type: "always" });
  });
});

describe("toAvailableVisibility", () => {
  it("recursively converts completed quest gates to available quest gates", () => {
    const condition: VisibilityCondition = {
      type: "and",
      conditions: [
        { type: "questCompleted", questId: "repair_the_bridge" as QuestId },
        {
          type: "or",
          conditions: [
            { type: "minesLevel", floor: 20 },
            { type: "questCompleted", questId: "find_the_magic_key" as QuestId },
          ],
        },
      ],
    };

    expect(toAvailableVisibility(condition)).toEqual({
      type: "and",
      conditions: [
        { type: "questAvailable", questId: "repair_the_bridge" },
        {
          type: "or",
          conditions: [
            { type: "minesLevel", floor: 20 },
            { type: "questAvailable", questId: "find_the_magic_key" },
          ],
        },
      ],
    });
  });
});
