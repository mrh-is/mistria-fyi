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

  it("names each monster after its reviewed pet variant, in every locale", () => {
    const fiddle = makeFiddle({
      monsters: { cat: { cat: {}, cat_void: {}, default: {} }, clod: { mistrilclod: {} } },
      pets: { variants: { lava_cat: { name: "Lava Cat" }, void_cat: { name: "Void Cat" } } },
    });

    const names = extractMonsterNames(fiddle);
    expect(names.en).toEqual({ cat: "Lava Cat", cat_void: "Void Cat" });
    expect(names.fr).toEqual(names.en);
  });

  it("throws for a monster with no reviewed pet variant", () => {
    const fiddle = makeFiddle({ monsters: { slime: { slime: {} } }, pets: { variants: {} } });
    expect(() => extractMonsterNames(fiddle)).toThrow(/"slime" has no reviewed pet variant/);
  });

  it("throws when a source table is missing", () => {
    expect(() => extractMonsterNames(makeFiddle({ monsters: {} }))).toThrow(/pets\.variants/);
    expect(() => extractMonsterNames(makeFiddle({ pets: { variants: {} } }))).toThrow(/monsters/);
  });

  it("throws when the reviewed pet variant is missing", () => {
    const fiddle = makeFiddle({ monsters: { cat: { cat: {} } }, pets: { variants: {} } });
    expect(() => extractMonsterNames(fiddle)).toThrow(/"lava_cat", which is unnamed/);
  });
});
