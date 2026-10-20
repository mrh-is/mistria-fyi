import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { buildCutsceneQuestMap } from "./cutscene-quest-map.js";

// Minimal fiddle factory for cutscene tests
function makeCutsceneFiddle(overrides: {
  cutscenes?: Record<string, Record<string, unknown>>;
  quests?: Record<string, Record<string, unknown>>;
  seals?: Record<string, Record<string, unknown>>;
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

  it("maps the first quest of an array quest_to_start", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        translating_the_fire_tablet: {
          quest_to_start: ["procuring_the_sealing_scroll", "breaking_the_fire_seal"],
        },
      },
    });
    expect(buildCutsceneQuestMap(fiddle).translating_the_fire_tablet).toEqual({
      phase: "available",
      questId: "procuring_the_sealing_scroll",
    });
  });

  it.each([
    ["an empty array quest_to_start", { quest_to_start: [] }, "at least one quest"],
    ["a non-string quest_to_start entry", { quest_to_start: [1] }, "Expected string"],
    ["a non-string quest_to_progress", { quest_to_progress: ["a"] }, "Expected string"],
  ])("rejects %s", (_label, cutscene, message) => {
    const fiddle = makeCutsceneFiddle({ cutscenes: { bad_scene: cutscene } });
    expect(() => buildCutsceneQuestMap(fiddle)).toThrow(message);
  });

  it("maps seals.toml cutscenes to their completed quest", () => {
    const fiddle = makeCutsceneFiddle({
      quests: {
        story_quests: {
          find_the_magic_key: { stages: [] },
          the_water_tablet: { stages: [{}, {}] },
        },
      },
      seals: {
        priestess: { quest: "find_the_magic_key", stage: 3 },
        water: { cutscene: "break_water_seal", quest: "the_water_tablet", stage: 1 },
      },
    });
    const map = buildCutsceneQuestMap(fiddle);
    expect(map.break_water_seal).toEqual({ phase: "completed", questId: "the_water_tablet" });
    expect(Object.values(map).map(({ questId }) => questId)).not.toContain("find_the_magic_key");
  });

  it("keeps cutscene-table and quest-stage links ahead of seals.toml", () => {
    const fiddle = makeCutsceneFiddle({
      quests: {
        story_quests: {
          breaking_the_ruins_seal: {
            stages: [{ queries: [{ cutscene: "break_ruins_seal_pt_2" }] }],
          },
          creating_the_void_mass: { stages: [{}] },
        },
      },
      seals: {
        void: { cutscene: "break_ruins_seal_pt_2", quest: "creating_the_void_mass", stage: 0 },
      },
    });
    expect(buildCutsceneQuestMap(fiddle).break_ruins_seal_pt_2).toEqual({
      phase: "available",
      questId: "breaking_the_ruins_seal",
    });
  });

  it.each([
    ["an unknown quest", { quest: "missing_quest", stage: 1 }, "Unknown quest missing_quest"],
    ["an intermediate stage", { quest: "the_water_tablet", stage: 0 }, "final stage 1, got 0"],
    ["an out-of-range stage", { quest: "the_water_tablet", stage: 2 }, "final stage 1, got 2"],
    ["a missing stage", { quest: "the_water_tablet" }, "Expected finite number"],
    ["a non-numeric stage", { quest: "the_water_tablet", stage: "1" }, "Expected finite number"],
  ])("rejects a seal with %s", (_label, seal, message) => {
    const fiddle = makeCutsceneFiddle({
      quests: { story_quests: { the_water_tablet: { stages: [{}, {}] } } },
      seals: { water: { cutscene: "break_water_seal", ...seal } },
    });
    expect(() => buildCutsceneQuestMap(fiddle)).toThrow(message);
  });
});
