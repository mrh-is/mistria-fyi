import path from "node:path";
import { describe, expect, it } from "vitest";

import { SAVE_OBSERVATIONS } from "#lib/engine/import-save.observations.ts";

import { saveFixtures } from "./save-fixtures.ts";

describe("saveFixtures", () => {
  it("names one fixture per observation, keyed by game version & file", () => {
    const fixtures = saveFixtures("/input");
    expect(fixtures).toHaveLength(SAVE_OBSERVATIONS.length);
    expect(fixtures[0]).toEqual({
      key: "saves/v1.0.8/game-1315159680-autosave.sav",
      localPath: path.join("/input", "v1.0.8", "save", "game-1315159680-autosave.sav"),
      sha256: SAVE_OBSERVATIONS[0]?.sha256,
    });
  });
});
