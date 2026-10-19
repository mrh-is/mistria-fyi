import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { buildCutsceneQuestMap } from "./cutscene-quest-map.js";

// Minimal fiddle factory for cutscene tests
function makeCutsceneFiddle(overrides: {
  cutscenes?: Record<string, Record<string, unknown>>;
  quests?: Record<string, Record<string, unknown>>;
}) {
  return makeFiddle({
    cutscenes: overrides.cutscenes ?? {},
    quests: overrides.quests ?? {},
    ...overrides,
  });
}

describe("buildCutsceneQuestMap", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects the former nested cutscene shape", () => {
    expect(() => buildCutsceneQuestMap(makeFiddle({ cutscenes: { cutscenes: {} } }))).toThrow(
      "Expected flat cutscene table",
    );
  });

  it("maps explicit quest_to_start on cutscene", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        my_cutscene: { quest_to_start: "some_quest" },
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.my_cutscene).toEqual({
      phase: "available",
      questId: "some_quest",
    });
  });

  it("maps a setup cutscene to the quest its follow-up scene starts", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        find_the_weathervane: {
          quest_to_start: "find_the_weathervane",
          requirements: { seen_cutscene: "find_the_weathervane_setup" },
        },
        find_the_weathervane_setup: {},
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.find_the_weathervane_setup).toEqual({
      phase: "available",
      questId: "find_the_weathervane",
    });
  });

  it("keeps a setup cutscene's own quest link over its follow-up's", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        follow_up: { quest_to_start: "later_quest", requirements: { seen_cutscene: "setup" } },
        setup: { quest_to_progress: "earlier_quest" },
      },
    });
    expect(buildCutsceneQuestMap(fiddle).setup).toEqual({
      phase: "completed",
      questId: "earlier_quest",
    });
  });

  it("maps explicit quest_to_progress on cutscene", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        repair_the_inn_pt_2: { quest_to_progress: "repair_the_inn" },
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.repair_the_inn_pt_2).toEqual({
      phase: "completed",
      questId: "repair_the_inn",
    });
  });

  it("maps quest stage cutscene references", () => {
    const fiddle = makeCutsceneFiddle({
      quests: {
        story_quests: {
          some_quest: {
            stages: [{ queries: [{ cutscene: "quest_start_scene" }] }],
          },
        },
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.quest_start_scene).toEqual({
      phase: "available",
      questId: "some_quest",
    });
  });

  it("maps _pt_2 naming convention to completed phase", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        repair_the_general_store_pt_2: {},
      },
      quests: {
        story_quests: {
          repair_the_general_store: { stages: [] },
        },
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.repair_the_general_store_pt_2).toEqual({
      phase: "completed",
      questId: "repair_the_general_store",
    });
  });

  it("handles priestess_quarters override to find_the_magic_key", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        priestess_quarters_pt_2: { quest_to_progress: "find_the_magic_key" },
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.priestess_quarters_pt_2).toEqual({
      phase: "completed",
      questId: "find_the_magic_key",
    });
  });

  it("skips unmappable cutscenes like the_unusual_tree", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        the_unusual_tree_pt_1: {},
        the_unusual_tree_pt_2: {},
      },
      quests: {},
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.the_unusual_tree_pt_1).toBeUndefined();
    expect(map.the_unusual_tree_pt_2).toBeUndefined();
  });

  it("explicit fields take priority over naming convention", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        dragon_tablet_pt_2: { quest_to_progress: "the_dragonsworn_tablet" },
      },
      quests: {
        story_quests: {
          dragon_tablet: { stages: [] },
        },
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.dragon_tablet_pt_2).toEqual({
      phase: "completed",
      questId: "the_dragonsworn_tablet",
    });
  });
});
