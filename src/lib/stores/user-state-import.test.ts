import { afterEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { extractSaveProgress } from "#lib/engine/import-save.js";
import { getMaxRenownLevel, MAX_HEART_LEVEL, MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { SkillId, VillagerId } from "#lib/types/tracker-data.js";

const MAX_MINE_FLOOR = trackerData.mines.biomes.at(-1)?.floors.end ?? 0;

describe("restoreBackup validation", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("succeeds with a valid backup", () => {
    const json = userState.exportBackup();
    expect(JSON.parse(json)).toMatchObject({ version: 1 });
    const result = userState.restoreBackup(json);
    expect(result.ok).toBe(true);
  });

  it("rejects the pre-launch format", () => {
    const data = JSON.parse(userState.exportBackup()) as Record<string, unknown>;
    data.version = "2";
    data.completed = data.progress;
    delete data.progress;

    expect(userState.restoreBackup(JSON.stringify(data))).toEqual({
      error: "unsupported-version",
      ok: false,
    });
  });

  it("rejects malformed JSON", () => {
    const result = userState.restoreBackup("not json {{{");
    expect(result).toEqual({ error: "malformed-json", ok: false });
  });

  it("rejects non-object JSON", () => {
    const result = userState.restoreBackup('"just a string"');
    expect(result).toEqual({ error: "malformed-json", ok: false });
  });

  it("rejects null JSON", () => {
    const result = userState.restoreBackup("null");
    expect(result).toEqual({ error: "malformed-json", ok: false });
  });

  it("rejects JSON without a version field", () => {
    const result = userState.restoreBackup(JSON.stringify({ progress: {} }));
    expect(result).toEqual({ error: "invalid-fields", ok: false });
  });

  it("rejects an unsupported version", () => {
    const json = userState.exportBackup();
    const data = JSON.parse(json) as Record<string, unknown>;
    data.version = 99;
    const result = userState.restoreBackup(JSON.stringify(data));
    expect(result).toEqual({ error: "unsupported-version", ok: false });
  });

  it("rejects a backup missing the progress object", () => {
    const result = userState.restoreBackup(JSON.stringify({ version: 1 }));
    expect(result).toEqual({ error: "invalid-fields", ok: false });
  });

  it("rejects a backup with invalid progress structure", () => {
    const result = userState.restoreBackup(
      JSON.stringify({ progress: "not an object", version: 1 }),
    );
    expect(result).toEqual({ error: "invalid-fields", ok: false });
  });

  it("preserves existing state after a failed import", () => {
    const json = userState.exportBackup();
    const original = JSON.parse(json) as Record<string, unknown>;

    const badResult = userState.restoreBackup("not json");
    expect(badResult.ok).toBe(false);

    const afterFail = JSON.parse(userState.exportBackup()) as Record<string, unknown>;
    expect(afterFail).toEqual(original);
  });

  it("rejects malformed required and nested fields atomically", () => {
    const original = userState.exportBackup();
    const cases: { mutate: (data: Record<string, unknown>) => void; name: string }[] = [
      {
        mutate: (data) => ((data.worldState as Record<string, unknown>).season = "monsoon"),
        name: "worldState.season",
      },
      {
        mutate: (data) => ((data.worldState as Record<string, unknown>).weather = 42),
        name: "worldState.weather",
      },
      {
        mutate: (data) => delete (data.progress as Record<string, unknown>).almanac,
        name: "progress.almanac",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).animalCosmetics = { chicken: "hat" }),
        name: "progress.animalCosmetics",
      },
      {
        mutate: (data) => ((data.progress as Record<string, unknown>).animals = { chicken: [123] }),
        name: "progress.animals",
      },
      {
        mutate: (data) => ((data.progress as Record<string, unknown>).cosmetics = "hat"),
        name: "progress.cosmetics",
      },
      {
        mutate: (data) => ((data.progress as Record<string, unknown>).mineFloor = "deep"),
        name: "progress.mineFloor",
      },
      {
        mutate: (data) => ((data.progress as Record<string, unknown>).spells = [1]),
        name: "progress.spells",
      },
      {
        mutate: (data) => delete (data.progress as Record<string, unknown>).museum,
        name: "progress.museum",
      },
      {
        mutate: (data) => ((data.progress as Record<string, unknown>).renown = "max"),
        name: "progress.renown",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).skillLevels = { farming: "sixty" }),
        name: "progress.skillLevels",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).questStates = { intro: "finished" }),
        name: "progress.questStates",
      },
      {
        mutate: (data) => ((data.progress as Record<string, unknown>).mineFloor = 1.5),
        name: "progress.mineFloor (fractional)",
      },
      {
        mutate: (data) => ((data.progress as Record<string, unknown>).mineFloor = -1),
        name: "progress.mineFloor (negative)",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).mineFloor = MAX_MINE_FLOOR + 1),
        name: "progress.mineFloor (above maximum)",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).heartLevels = { adeline: 3.5 }),
        name: "progress.heartLevels (fractional)",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).heartLevels = { adeline: -1 }),
        name: "progress.heartLevels (negative)",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).heartLevels = {
            adeline: 13,
          }),
        name: "progress.heartLevels (above the legacy maximum)",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).skillLevels = { farming: 3.5 }),
        name: "progress.skillLevels (fractional)",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).skillLevels = { farming: -1 }),
        name: "progress.skillLevels (negative)",
      },
      {
        mutate: (data) =>
          ((data.progress as Record<string, unknown>).skillLevels = {
            farming: MAX_SKILL_LEVEL + 1,
          }),
        name: "progress.skillLevels (above maximum)",
      },
    ];

    for (const testCase of cases) {
      const data = JSON.parse(original) as Record<string, unknown>;
      testCase.mutate(data);

      expect(userState.restoreBackup(JSON.stringify(data)), testCase.name).toEqual({
        error: "invalid-fields",
        ok: false,
      });
      expect(userState.exportBackup(), `${testCase.name} should preserve state`).toBe(original);
    }
  });

  it("replaces state on successful import", () => {
    const json = userState.exportBackup();
    const data = JSON.parse(json) as Record<string, unknown>;
    const progress = data.progress as Record<string, unknown>;
    progress.renown = 15;

    const result = userState.restoreBackup(JSON.stringify(data));
    expect(result.ok).toBe(true);
    expect(userState.state.progress.renown).toBe(15);
  });

  it("clamps legacy heart levels above the game's maximum", () => {
    const data = JSON.parse(userState.exportBackup()) as Record<string, unknown>;
    (data.progress as Record<string, unknown>).heartLevels = { adeline: 12 };

    expect(userState.restoreBackup(JSON.stringify(data)).ok).toBe(true);
    expect(userState.state.progress.heartLevels["adeline" as VillagerId]).toBe(MAX_HEART_LEVEL);
  });

  it("restores boundary values for every numeric domain", () => {
    const json = userState.exportBackup();
    const data = JSON.parse(json) as Record<string, unknown>;
    const progress = data.progress as Record<string, unknown>;
    progress.mineFloor = MAX_MINE_FLOOR;
    progress.heartLevels = { adeline: MAX_HEART_LEVEL };
    progress.skillLevels = { farming: MAX_SKILL_LEVEL };

    const result = userState.restoreBackup(JSON.stringify(data));
    expect(result.ok).toBe(true);
    expect(userState.state.progress.mineFloor).toBe(MAX_MINE_FLOOR);
    expect(userState.state.progress.heartLevels["adeline" as VillagerId]).toBe(MAX_HEART_LEVEL);
    expect(userState.state.progress.skillLevels["farming" as SkillId]).toBe(MAX_SKILL_LEVEL);
  });
});

describe("mergeFromSave numeric domains", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("never installs out-of-domain levels from a native save", () => {
    const { completed, warnings } = extractSaveProgress({
      gamedata: {
        maximum_mines_level: 9999,
        t2_world_facts: { adeline_heart_level: 99, farming_level: 999, renown: 9999 },
      },
    });
    userState.mergeFromSave(completed);

    expect(userState.state.progress.mineFloor).toBe(MAX_MINE_FLOOR);
    expect(userState.state.progress.heartLevels["adeline" as VillagerId]).toBe(MAX_HEART_LEVEL);
    expect(userState.state.progress.skillLevels["farming" as SkillId]).toBe(MAX_SKILL_LEVEL);
    expect(userState.state.progress.renown).toBe(getMaxRenownLevel());
    expect(warnings).toHaveLength(3);
  });

  it("clamps levels handed directly to the merge", () => {
    userState.mergeFromSave({
      heartLevels: { adeline: 10.7 } as never,
      mineFloor: 9999,
      renown: Number.POSITIVE_INFINITY,
      skillLevels: { farming: -5 } as never,
    });

    expect(userState.state.progress.mineFloor).toBe(MAX_MINE_FLOOR);
    expect(userState.state.progress.renown).toBe(0);
    expect(userState.state.progress.skillLevels["farming" as SkillId]).toBeUndefined();
    expect(userState.state.progress.heartLevels["adeline" as VillagerId]).toBe(10);
  });

  it("preserves higher existing progress across an additive import", () => {
    userState.setHeartLevel("adeline" as VillagerId, 8);
    userState.setSkillLevel("farming" as SkillId, 30);
    userState.setRenown(5);
    userState.setMineFloor(20);

    const { completed } = extractSaveProgress({
      gamedata: {
        maximum_mines_level: 10,
        t2_world_facts: { adeline_heart_level: 3, farming_level: 10, renown: 2 },
      },
    });
    const { counts } = userState.mergeFromSave(completed);

    expect(userState.state.progress.heartLevels["adeline" as VillagerId]).toBe(8);
    expect(userState.state.progress.skillLevels["farming" as SkillId]).toBe(30);
    expect(userState.state.progress.renown).toBe(5);
    expect(userState.state.progress.mineFloor).toBe(20);
    expect(counts.heartLevels).toBe(0);
    expect(counts.skillLevels).toBe(0);
    expect(counts.renown).toBe(0);
    expect(counts.mineFloor).toBe(0);
  });
});
