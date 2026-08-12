import { afterEach, describe, expect, it, vi } from "vitest";

import { extractQuestGates } from "./quest-gates.js";

import type { ParsedGameData } from "../parse-fiddle.js";

describe("extractQuestGates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("indexes tracked item rewards in quest order without duplicates or untracked groups", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        request_board: {
          ignored_request: {
            rewards: [{ item: "turnip" }],
          },
        },
        story_quests: {
          first_quest: {
            rewards: [{ item: "turnip" }, { item: "turnip" }, { recipe_scroll: "turnip_soup" }],
          },
          second_quest: {
            rewards: [{ item: "turnip" }],
          },
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuestGates(fiddle)).toEqual({
      animalGates: {},
      itemGates: {
        turnip: ["first_quest", "second_quest"],
      },
      progressionFlagToQuests: {},
      spellGates: {},
    });
  });
});
