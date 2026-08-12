import { afterEach, describe, expect, it, vi } from "vitest";

import { extractQuests } from "./quests.js";

import type { ParsedGameData } from "../parse-fiddle.js";

describe("extractQuests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves a present tracked quest group with no accepted quests", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        story_quests: {
          default: {},
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle)).toEqual({ story_quests: {} });
  });

  it("maps a populated tracked quest with its name and NPC", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        story_quests: {
          meet_juniper: {
            name: "Meet Juniper",
            npc_for_icon: "juniper",
          },
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle)).toEqual({
      story_quests: {
        meet_juniper: {
          name: "Meet Juniper",
          npc: "juniper",
        },
      },
    });
  });

  it("does not log a summary when the quest root is absent", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(extractQuests({} as ParsedGameData)).toEqual({});
    expect(logSpy).not.toHaveBeenCalled();
  });
});
