import { afterEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { extractSaveProgress } from "#lib/engine/import-save.js";
import { getMaxRenownLevel, MAX_HEART_LEVEL, MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordKeys } from "#lib/utils/record.js";

import type { SkillId, VillagerId } from "#lib/types/tracker-data.js";

const MAX_MINE_FLOOR = trackerData.mines.biomes.at(-1)?.floors.end ?? 0;

describe("restoreBackup validation", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("succeeds with a valid backup", () => {
    const json = userState.exportBackup();
    expect(JSON.parse(json)).toMatchObject({ version: "2" });
    const result = userState.restoreBackup(json);
    expect(result.ok).toBe(true);
  });

  it("restores a preceding-release backup without losing tracked IDs", () => {
    const almanacId = Object.values(trackerData.almanac)[0].items[0].itemIds[0];
    const cosmeticId = recordKeys(trackerData.cosmetics)[0];
    const data = JSON.parse(userState.exportBackup()) as Record<string, unknown>;
    data.version = "1";
    const completed = data.completed as Record<string, unknown>;
    completed.almanac = [almanacId];
    completed.cosmetics = [cosmeticId];

    expect(userState.restoreBackup(JSON.stringify(data))).toEqual({ ok: true });
    expect(userState.state.completed.almanac).toContain(almanacId);
    expect(userState.state.completed.cosmetics).toContain(cosmeticId);
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
    const result = userState.restoreBackup(JSON.stringify({ completed: {} }));
    expect(result).toEqual({ error: "invalid-fields", ok: false });
  });

  it("rejects an unsupported version", () => {
    const json = userState.exportBackup();
    const data = JSON.parse(json) as Record<string, unknown>;
    data.version = "99";
    const result = userState.restoreBackup(JSON.stringify(data));
    expect(result).toEqual({ error: "unsupported-version", ok: false });
  });

  it("rejects a backup missing the completed object", () => {
    const result = userState.restoreBackup(JSON.stringify({ version: "1" }));
    expect(result).toEqual({ error: "invalid-fields", ok: false });
  });

  it("rejects a backup with invalid completed structure", () => {
    const result = userState.restoreBackup(
      JSON.stringify({ completed: "not an object", version: "1" }),
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
      { mutate: (data) => (data.availabilityMode = "sometimes"), name: "availabilityMode" },
      {
        mutate: (data) => ((data.worldState as Record<string, unknown>).season = "monsoon"),
        name: "worldState.season",
      },
      {
        mutate: (data) => ((data.worldState as Record<string, unknown>).weather = 42),
        name: "worldState.weather",
      },
      {
        mutate: (data) => delete (data.completed as Record<string, unknown>).almanac,
        name: "completed.almanac",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).animalCosmetics = { chicken: "hat" }),
        name: "completed.animalCosmetics",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).animals = { chicken: [123] }),
        name: "completed.animals",
      },
      {
        mutate: (data) => ((data.completed as Record<string, unknown>).cosmetics = "hat"),
        name: "completed.cosmetics",
      },
      {
        mutate: (data) => ((data.completed as Record<string, unknown>).mineFloor = "deep"),
        name: "completed.mineFloor",
      },
      {
        mutate: (data) => ((data.completed as Record<string, unknown>).spells = [1]),
        name: "completed.spells",
      },
      {
        mutate: (data) => delete (data.completed as Record<string, unknown>).museum,
        name: "completed.museum",
      },
      {
        mutate: (data) => ((data.completed as Record<string, unknown>).renown = "max"),
        name: "completed.renown",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).skillLevels = { farming: "sixty" }),
        name: "completed.skillLevels",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).questStates = { intro: "finished" }),
        name: "completed.questStates",
      },
      {
        mutate: (data) => ((data.completed as Record<string, unknown>).mineFloor = 1.5),
        name: "completed.mineFloor (fractional)",
      },
      {
        mutate: (data) => ((data.completed as Record<string, unknown>).mineFloor = -1),
        name: "completed.mineFloor (negative)",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).mineFloor = MAX_MINE_FLOOR + 1),
        name: "completed.mineFloor (above maximum)",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).heartLevels = { adeline: 3.5 }),
        name: "completed.heartLevels (fractional)",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).heartLevels = { adeline: -1 }),
        name: "completed.heartLevels (negative)",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).heartLevels = {
            adeline: MAX_HEART_LEVEL + 1,
          }),
        name: "completed.heartLevels (above maximum)",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).skillLevels = { farming: 3.5 }),
        name: "completed.skillLevels (fractional)",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).skillLevels = { farming: -1 }),
        name: "completed.skillLevels (negative)",
      },
      {
        mutate: (data) =>
          ((data.completed as Record<string, unknown>).skillLevels = {
            farming: MAX_SKILL_LEVEL + 1,
          }),
        name: "completed.skillLevels (above maximum)",
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
    const completed = data.completed as Record<string, unknown>;
    completed.renown = 15;
    data.completed = completed;

    const result = userState.restoreBackup(JSON.stringify(data));
    expect(result.ok).toBe(true);
    expect(userState.state.completed.renown).toBe(15);
  });

  it("restores boundary values for every numeric domain", () => {
    const json = userState.exportBackup();
    const data = JSON.parse(json) as Record<string, unknown>;
    const completed = data.completed as Record<string, unknown>;
    completed.mineFloor = MAX_MINE_FLOOR;
    completed.heartLevels = { adeline: MAX_HEART_LEVEL };
    completed.skillLevels = { farming: MAX_SKILL_LEVEL };

    const result = userState.restoreBackup(JSON.stringify(data));
    expect(result.ok).toBe(true);
    expect(userState.state.completed.mineFloor).toBe(MAX_MINE_FLOOR);
    expect(userState.state.completed.heartLevels["adeline" as VillagerId]).toBe(MAX_HEART_LEVEL);
    expect(userState.state.completed.skillLevels["farming" as SkillId]).toBe(MAX_SKILL_LEVEL);
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

    expect(userState.state.completed.mineFloor).toBe(MAX_MINE_FLOOR);
    expect(userState.state.completed.heartLevels["adeline" as VillagerId]).toBe(MAX_HEART_LEVEL);
    expect(userState.state.completed.skillLevels["farming" as SkillId]).toBe(MAX_SKILL_LEVEL);
    expect(userState.state.completed.renown).toBe(getMaxRenownLevel());
    expect(warnings).toHaveLength(3);
  });

  it("clamps levels handed directly to the merge", () => {
    userState.mergeFromSave({
      heartLevels: { adeline: 12.7 } as never,
      mineFloor: 9999,
      renown: Number.POSITIVE_INFINITY,
      skillLevels: { farming: -5 } as never,
    });

    expect(userState.state.completed.mineFloor).toBe(MAX_MINE_FLOOR);
    expect(userState.state.completed.renown).toBe(0);
    expect(userState.state.completed.skillLevels["farming" as SkillId]).toBeUndefined();
    expect(userState.state.completed.heartLevels["adeline" as VillagerId]).toBe(12);
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

    expect(userState.state.completed.heartLevels["adeline" as VillagerId]).toBe(8);
    expect(userState.state.completed.skillLevels["farming" as SkillId]).toBe(30);
    expect(userState.state.completed.renown).toBe(5);
    expect(userState.state.completed.mineFloor).toBe(20);
    expect(counts.heartLevels).toBe(0);
    expect(counts.skillLevels).toBe(0);
    expect(counts.renown).toBe(0);
    expect(counts.mineFloor).toBe(0);
  });
});
