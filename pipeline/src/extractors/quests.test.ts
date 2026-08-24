import { afterEach, describe, expect, it, vi } from "vitest";

import { extractQuests } from "./quests.js";

import type { ParsedGameData } from "../parse-fiddle.js";

describe("extractQuests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const emptyQuests = { cooking: {}, crown: {}, fetch: {}, heart: {}, mission: {}, story: {} };

  it("preserves a present tracked quest group with no accepted quests", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        story_quests: {
          default: {},
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle)).toEqual(emptyQuests);
  });

  it("maps a populated tracked quest with its name, NPC, and itemId", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        fetch_quests: {
          meet_juniper: {
            name: "Meet Juniper",
            npc_for_icon: "juniper",
            stages: [{ requirements: { has_item: "wild_berries" } }],
          },
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle)).toEqual({
      ...emptyQuests,
      fetch: {
        meet_juniper: {
          itemId: "wild_berries",
          name: "Meet Juniper",
          npc: "juniper",
          sources: [],
        },
      },
    });
  });

  it("does not log a summary when the quest root is absent", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(extractQuests({} as ParsedGameData)).toEqual(emptyQuests);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
