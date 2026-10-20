import { describe, expect, it } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { extractTownRankQuestLevels } from "./town-rank-quests.js";

const ranks = [
  { levels: { start: 0, end: 9 } },
  { levels: { start: 10, end: 19 } },
  { levels: { start: 20, end: 20 } },
];

function rankQuest(requirements: Record<string, unknown>) {
  return { stages: [{ requirements }] };
}

describe("extractTownRankQuestLevels", () => {
  it("derives rank thresholds from native stage requirements & rank boundaries", () => {
    const fiddle = makeFiddle({
      quests: {
        story_quests: {
          reach_example_town_rank: rankQuest({ reached_renown_level: 20 }),
          unrelated_quest: rankQuest({ reached_renown_level: 5 }),
        },
      },
    });
    expect(extractTownRankQuestLevels(fiddle, ranks)).toEqual(
      new Map([["reach_example_town_rank", 20]]),
    );
  });

  it("rejects a rank quest whose threshold has no matching rank", () => {
    const fiddle = makeFiddle({
      quests: {
        story_quests: {
          reach_unknown_town_rank: rankQuest({ reached_renown_level: 15 }),
        },
      },
    });
    expect(() => extractTownRankQuestLevels(fiddle, ranks)).toThrow(
      /reach_unknown_town_rank.*no matching town rank/,
    );
  });

  it.each([{}, { reached_renown_level: "20" }])(
    "rejects malformed rank requirements: %j",
    (requirements) => {
      const fiddle = makeFiddle({
        quests: {
          story_quests: {
            reach_example_town_rank: rankQuest(requirements),
          },
        },
      });
      expect(() => extractTownRankQuestLevels(fiddle, ranks)).toThrow(
        /renown requirement|reached_renown_level/,
      );
    },
  );

  it("rejects additional objectives instead of treating a rank as sufficient", () => {
    const fiddle = makeFiddle({
      quests: {
        story_quests: {
          reach_example_town_rank: rankQuest({
            has_item: "example_item",
            reached_renown_level: 20,
          }),
        },
      },
    });
    expect(() => extractTownRankQuestLevels(fiddle, ranks)).toThrow(/additional requirements/);
  });
});
