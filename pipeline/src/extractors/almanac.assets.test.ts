import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "../evaluate";
import { parseFiddle } from "../parse-fiddle";
import { requireGameAssetsDir } from "../test-helpers";
import { extractAlmanac } from "./almanac";

import type { AlmanacCategoryId, ItemId } from "$lib/types/tracker-data.js";

describe("extractAlmanac — v1.0.5 assets", () => {
  it("matches the verified category totals while preserving distinct bed presentations", () => {
    const assetsDir = requireGameAssetsDir();
    const fiddle = parseFiddle(assetsDir).data;
    evaluateExpressions(fiddle);
    const { almanac, localeNames, localizationReport } = extractAlmanac(fiddle, assetsDir);
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
    expect(localizationReport.fallbackItemIds.ja).toHaveLength(305);
    expect(localizationReport.nonLocalizableItems).toEqual([
      "other/misc/animal_cosmetic (missing name)",
      "other/misc/cosmetic (missing name)",
      "other/misc/horse_potion (missing name)",
      "other/misc/lurid_colored_drink (missing name)",
      "other/misc/pet_cosmetic (missing name)",
      "other/misc/stinky_stamina_potion (missing name)",
    ]);
  });
});
