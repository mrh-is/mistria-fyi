import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { extractMonsterNames } from "./monsters.js";

describe("extractMonsterNames", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names each monster from the reviewed table, in every locale", () => {
    const fiddle = makeFiddle({
      monsters: { cat: { cat: {}, cat_void: {}, default: {} }, clod: { mistrilclod: {} } },
      // Game 1.0.7's bare pet variant names don't leak into monster names.
      pets: { variants: { lava_cat: { name: "Default" }, void_cat: { name: "Default" } } },
    });

    const names = extractMonsterNames(fiddle);
    expect(names.en).toEqual({ cat: "Lava Cat", cat_void: "Void Cat" });
    expect(names.fr).toEqual(names.en);
  });

  it("throws for a monster with no reviewed name", () => {
    const fiddle = makeFiddle({ monsters: { slime: { slime: {} } } });
    expect(() => extractMonsterNames(fiddle)).toThrow(/"slime" has no reviewed name/);
  });

  it("throws when the monsters table is missing", () => {
    expect(() => extractMonsterNames(makeFiddle({}))).toThrow(/monsters/);
  });
});
