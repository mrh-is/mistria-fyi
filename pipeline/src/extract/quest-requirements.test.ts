import { describe, expect, it } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { assignQuestRequirements } from "./quest-requirements.js";

import type { QuestId, TrackerData } from "#lib/types/tracker-data.js";

function questRegistry(): TrackerData["quests"] {
  return {
    cooking: {},
    crown: {},
    fetch: {},
    heart: {},
    mission: {},
    story: { example: { sources: [] } },
  } as TrackerData["quests"];
}

describe("quest requirements", () => {
  it("projects acquired-item history & every member of a completed-quest array", () => {
    const quests = questRegistry();
    assignQuestRequirements(
      makeFiddle({
        quests: {
          request_board: {
            example: {
              requirements: { acquired_item: "lilac", completed_quest: ["first", "second"] },
            },
          },
          story_quests: { example: {} },
        },
      }),
      quests,
      {},
    );
    expect(quests.story["example" as QuestId].startCondition).toEqual({
      type: "all",
      conditions: [
        { type: "itemAcquired", itemId: "lilac" },
        { type: "quest", questId: "first", state: "completed" },
        { type: "quest", questId: "second", state: "completed" },
      ],
    });
  });

  it("keeps alternative start routes & ignores stage objectives", () => {
    const quests = questRegistry();
    assignQuestRequirements(
      makeFiddle({
        letters: {
          invitation: {
            quest_to_start: "example",
            requirements: { completed_quest: "repair_the_bridge" },
          },
        },
        quests: {
          request_board: {
            example: { requirements: { is_season: "summer", reached_skill_level: { fishing: 2 } } },
          },
          story_quests: { example: { stages: [{ requirements: { has_item: { trout: 3 } } }, {}] } },
        },
      }),
      quests,
      {},
    );
    expect(quests.story["example" as QuestId]).toEqual({
      sources: [],
      startCondition: {
        type: "any",
        conditions: [
          {
            type: "all",
            conditions: [
              { type: "season", seasons: ["summer"] },
              { type: "skillLevel", level: 2, skillId: "fishing" },
            ],
          },
          { type: "quest", questId: "repair_the_bridge", state: "completed" },
        ],
      },
    });
  });

  it("preserves delays & exact dates alongside evaluable progression and seasonal gates", () => {
    const quests = questRegistry();
    assignQuestRequirements(
      makeFiddle({
        cutscenes: {
          invitation: {
            quest_to_start: ["example"],
            requirements: {
              completed_quest: { days_after: 3, quest: "prerequisite" },
              reached_date: { day: 7, exact: true, season: "fall" },
              reached_mines_level: 40,
            },
          },
        },
        quests: { story_quests: { example: {} } },
      }),
      quests,
      {},
    );
    expect(quests.story["example" as QuestId].startCondition).toEqual({
      type: "all",
      conditions: [
        { type: "quest", questId: "prerequisite", state: "completed" },
        {
          type: "gamePredicate",
          predicate: "completed_quest",
          value: { days_after: 3, quest: "prerequisite" },
        },
        { type: "season", seasons: ["fall"] },
        {
          type: "gamePredicate",
          predicate: "reached_date",
          value: { day: 7, exact: true, season: "fall" },
        },
        { type: "mineFloor", floor: 40 },
      ],
    });
  });

  it("follows a setup scene's gates instead of making the quest require itself", () => {
    const quests = questRegistry();
    assignQuestRequirements(
      makeFiddle({
        cutscenes: {
          invitation: { quest_to_start: "example", requirements: { seen_cutscene: "setup" } },
          setup: { requirements: { reached_mines_level: 20 } },
        },
        quests: { story_quests: { example: {} } },
      }),
      quests,
      { setup: { phase: "available", questId: "example" as QuestId } },
    );
    expect(quests.story["example" as QuestId].startCondition).toEqual({
      type: "mineFloor",
      floor: 20,
    });
  });

  it("retains nested alternatives, negations, named gates & untracked game facts", () => {
    const quests = questRegistry();
    assignQuestRequirements(
      makeFiddle({
        quests: {
          request_board: {
            example: {
              requirements: {
                or: [{ mine_access: true }, { earned_gold: 100, invert: { is_season: "winter" } }],
              },
            },
          },
          story_quests: { example: {} },
        },
        requirements: { mine_access: { reached_mines_level: 20 } },
      }),
      quests,
      {},
    );
    expect(quests.story["example" as QuestId].startCondition).toEqual({
      type: "any",
      conditions: [
        { type: "mineFloor", floor: 20 },
        {
          type: "all",
          conditions: [
            { type: "gamePredicate", predicate: "earned_gold", value: 100 },
            { type: "not", condition: { type: "season", seasons: ["winter"] } },
          ],
        },
      ],
    });
  });

  it("omits the start condition when nothing gates the quest", () => {
    const quests = questRegistry();
    assignQuestRequirements(
      makeFiddle({
        letters: { invitation: { quest_to_start: "example" } },
        quests: {
          story_quests: { example: { stages: [{ requirements: { has_item: "trout" } }] } },
        },
      }),
      quests,
      {},
    );
    expect(quests.story["example" as QuestId]).toEqual({ sources: [] });
  });

  it.each(["start", "named"])("rejects an unreviewed %s predicate with its source", (where) => {
    const quests = questRegistry();
    const requirements = { future_predicate: true };
    const fiddle = makeFiddle({
      quests: {
        request_board: {
          example: { requirements: where === "named" ? { future_gate: true } : requirements },
        },
        story_quests: { example: {} },
      },
      requirements: where === "named" ? { future_gate: requirements, future_predicate: {} } : {},
    });
    expect(() => {
      assignQuestRequirements(fiddle, quests, {});
    }).toThrow(/Unrecognized quest requirement "future_predicate".*quests/);
  });

  it("rejects a stage-only predicate used as a start gate", () => {
    const fiddle = makeFiddle({
      quests: {
        request_board: { example: { requirements: { has_item: "trout" } } },
        story_quests: { example: {} },
      },
    });
    expect(() => {
      assignQuestRequirements(fiddle, questRegistry(), {});
    }).toThrow(/Unrecognized quest requirement "has_item"/);
  });

  it("drops a start route that can never fire", () => {
    const quests = questRegistry();
    assignQuestRequirements(
      makeFiddle({
        letters: {
          blocked: { quest_to_start: "example", requirements: { or: [] } },
          open: { quest_to_start: "example", requirements: { reached_mines_level: 20 } },
        },
        quests: { story_quests: { example: {} } },
      }),
      quests,
      {},
    );
    expect(quests.story["example" as QuestId].startCondition).toEqual({
      type: "mineFloor",
      floor: 20,
    });
  });
});
