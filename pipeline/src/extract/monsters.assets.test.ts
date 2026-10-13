import { describe, expect, it } from "vitest";

import { parseFiddle } from "../parse/parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { extractMonsterNames, MONSTER_NAMES, MONSTERS_WITHOUT_PET_VARIANT } from "./monsters.js";

describe("extractMonsterNames — real assets", () => {
  const fiddle = parseFiddle(requireGameAssetsDir()).data;

  it("reviews only monsters the game defines", () => {
    const monsters = fiddle.monsters as Record<string, Record<string, unknown>>;
    const monsterIds = new Set(Object.values(monsters).flatMap((table) => Object.keys(table)));
    for (const id of [...Object.keys(MONSTER_NAMES), ...MONSTERS_WITHOUT_PET_VARIANT]) {
      expect(monsterIds.has(id), id).toBe(true);
    }
  });

  it("keeps the reviewed names over 1.0.7's bare pet variant names", () => {
    const names = extractMonsterNames(fiddle).en as Record<string, string>;
    expect(names.cat).toBe("Lava Cat");
    expect(names.cat_void).toBe("Void Cat");
    expect(names.rockclod_red).toBe("Red Rockclod");
  });
});
