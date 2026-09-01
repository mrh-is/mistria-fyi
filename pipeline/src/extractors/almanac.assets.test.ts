import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "../evaluate.js";
import { parseFiddle } from "../parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { extractAlmanac } from "./almanac.js";
import { extractRecipes } from "./recipes.js";

import type { AlmanacCategoryId, ItemId } from "$lib/types/tracker-data.js";

describe("extractAlmanac — v1.0.2 assets", () => {
  it("matches the verified category totals while preserving distinct bed presentations", () => {
    const fiddle = parseFiddle(requireGameAssetsDir()).data;
    evaluateExpressions(fiddle);
    const { recipeMemberItems } = extractRecipes(fiddle);
    const { almanac } = extractAlmanac(fiddle, recipeMemberItems);
    const fish = almanac["fish" as AlmanacCategoryId];
    const furniture = almanac["furniture" as AlmanacCategoryId];
    const materials = almanac["materials" as AlmanacCategoryId];

    expect(fish.items).toHaveLength(148);
    expect(materials.items).toHaveLength(77);
    expect(furniture.items).toHaveLength(957);

    expect(fish.items.some((entry) => entry.itemIds.includes("basic_wood" as ItemId))).toBe(true);
    expect(materials.items.some((entry) => entry.itemIds.includes("perfect_ruby" as ItemId))).toBe(
      true,
    );
    expect(furniture.items.filter((entry) => entry.recipeId === "emerald_bed")).toHaveLength(2);
  });
});
