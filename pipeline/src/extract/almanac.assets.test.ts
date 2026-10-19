import { describe, expect, it, vi } from "vitest";

import { createAssetsLocalizer } from "../localize/localize.js";
import { evaluateExpressions } from "../parse/evaluate.js";
import { parseFiddle } from "../parse/parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { extractAlmanac } from "./almanac.js";

import type { AlmanacCategoryId, ItemId } from "#lib/types/tracker-data.js";

describe("extractAlmanac — real assets", () => {
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
    // 1.0.7's chicken statue rewards add the Golden Fence & eight gold animal statues. The game's
    // own almanac reads 1,017 in 1.0.8; single & double beds share one recipe row.
    expect(furniture.items).toHaveLength(1017);

    expect(fish.items.some((entry) => entry.itemIds.includes("basic_wood" as ItemId))).toBe(true);
    expect(materials.items.some((entry) => entry.itemIds.includes("perfect_ruby" as ItemId))).toBe(
      true,
    );
    expect(furniture.items.filter((entry) => entry.recipeId === "emerald_bed")).toEqual([
      {
        itemIds: [
          "emerald_bed_v1",
          "emerald_bed_v2",
          "emerald_double_bed_v1",
          "emerald_double_bed_v2",
        ],
        recipeId: "emerald_bed",
      },
    ]);
    // 2,722 named items, less the four `ITEM_EXCLUSIONS`: three cutscene props & the unfinished
    // `gold_chest`.
    expect(Object.keys(localeNames.en)).toHaveLength(2718);
    expect(localeNames.en).not.toHaveProperty("balors_crate");
    expect(localeNames.en).not.toHaveProperty("gold_chest");
    expect(localeNames.en).not.toHaveProperty("harvest_day_pie");
    expect(localeNames.ja["turnip" as ItemId]).not.toBe(localeNames.en["turnip" as ItemId]);
    // 1.0.7's twelve new named items ship untranslated.
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ja: 314"));
    expect(log).toHaveBeenCalledWith("  Nameless items skipped (6):");
    expect(log).toHaveBeenCalledWith("    - other/misc/animal_cosmetic (missing name)");
    expect(log).toHaveBeenCalledWith("    - other/misc/stinky_stamina_potion (missing name)");
    log.mockRestore();
  });
});
