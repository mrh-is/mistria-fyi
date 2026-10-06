import { describe, expect, it, vi } from "vitest";

import { evaluateExpressions } from "../evaluate.js";
import { createAssetsLocalizer } from "../localize.js";
import { parseFiddle } from "../parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { extractAlmanac } from "./almanac.js";

import type { AlmanacCategoryId, ItemId } from "#lib/types/tracker-data.js";

describe("extractAlmanac — v1.0.5 assets", () => {
  it("matches the verified category totals while preserving distinct bed presentations", () => {
    const assetsDir = requireGameAssetsDir();
    const fiddle = parseFiddle(assetsDir).data;
    evaluateExpressions(fiddle);
    const log = vi.spyOn(console, "log").mockReturnValue(undefined);
    const { almanac, localeNames } = extractAlmanac(fiddle, createAssetsLocalizer(assetsDir));
    const fish = almanac["fish" as AlmanacCategoryId];
    const furniture = almanac["furniture" as AlmanacCategoryId];
    const materials = almanac["materials" as AlmanacCategoryId];

    expect(fish.items).toHaveLength(148);
    expect(materials.items).toHaveLength(77);
    expect(furniture.items).toHaveLength(1011);

    expect(fish.items.some((entry) => entry.itemIds.includes("basic_wood" as ItemId))).toBe(true);
    expect(materials.items.some((entry) => entry.itemIds.includes("perfect_ruby" as ItemId))).toBe(
      true,
    );
    expect(furniture.items.filter((entry) => entry.recipeId === "emerald_bed")).toHaveLength(2);
    expect(Object.keys(localeNames.en)).toHaveLength(2709);
    expect(localeNames.ja["turnip" as ItemId]).not.toBe(localeNames.en["turnip" as ItemId]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ja: 305"));
    expect(log).toHaveBeenCalledWith("  Nameless items skipped (6):");
    expect(log).toHaveBeenCalledWith("    - other/misc/animal_cosmetic (missing name)");
    expect(log).toHaveBeenCalledWith("    - other/misc/stinky_stamina_potion (missing name)");
    log.mockRestore();
  });
});
