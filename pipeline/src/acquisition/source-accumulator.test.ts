import { describe, expect, it } from "vitest";

import {
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  RecipeSourceAccumulator,
} from "./source-accumulator.js";

import type { Source } from "#lib/types/acquisition.js";
import type { CosmeticId, ItemId, MinesBiomeId, RecipeId } from "#lib/types/tracker-data.js";

describe("source accumulators", () => {
  it("keeps item and cosmetic target namespaces independent", () => {
    const items = new ItemSourceAccumulator();
    const cosmetics = new CosmeticSourceAccumulator();

    items.add("shared_id" as ItemId, { type: "default" });
    cosmetics.add("shared_id" as CosmeticId, { type: "renown", level: 20 });

    expect(items.toRecord()).toEqual({ shared_id: [{ type: "default" }] });
    expect(cosmetics.toRecord()).toEqual({ shared_id: [{ type: "renown", level: 20 }] });
  });

  it("sorts target IDs and sources by canonical JSON", () => {
    const sources = new ItemSourceAccumulator();

    sources.add("z_item" as ItemId, { type: "default" });
    sources.add("a_item" as ItemId, { type: "store", storeId: "z_store" as never });
    sources.add("a_item" as ItemId, { type: "renown", level: 5 });

    expect(sources.toRecord()).toEqual({
      a_item: [
        { type: "renown", level: 5 },
        { type: "store", storeId: "z_store" },
      ],
      z_item: [{ type: "default" }],
    });
  });

  it("preserves distinct gates for the same acquisition path", () => {
    const sources = new ItemSourceAccumulator();
    const targetId = "item" as ItemId;
    const first: Source = {
      type: "store",
      availability: { type: "season", seasons: ["spring"] },
      storeId: "general" as never,
      visibility: { type: "questCompleted", questId: "first" as never },
    };

    sources.add(targetId, first);
    sources.add(targetId, {
      ...first,
      visibility: { type: "questCompleted", questId: "second" as never },
    });
    sources.add(targetId, {
      ...first,
      availability: { type: "season", seasons: ["summer"] },
    });

    const accumulated = sources.get(targetId);
    expect(accumulated).toHaveLength(3);
    expect(accumulated).toContain(first);
    expect(accumulated).toContainEqual({
      ...first,
      visibility: { type: "questCompleted", questId: "second" },
    });
  });

  it("uses the same gate-aware deduplication for recipes", () => {
    const sources = new RecipeSourceAccumulator();
    const recipeId = "stew" as RecipeId;
    const first: Source = {
      type: "store",
      storeId: "general" as never,
      visibility: { type: "questCompleted", questId: "repair" as never },
    };
    sources.add(recipeId, first);
    sources.add(recipeId, { ...first });
    sources.add(recipeId, {
      ...first,
      visibility: { type: "questAvailable", questId: "repair" as never },
    });
    expect(sources.get(recipeId)).toHaveLength(2);
  });

  it("reconciles conflicting gates as ordered, paired alternatives regardless of insertion order", () => {
    const target = "stew" as RecipeId;
    const paths: Source[] = [
      {
        type: "store",
        availability: { type: "season", seasons: ["spring"] },
        storeId: "general" as never,
        visibility: { type: "questCompleted", questId: "repair" as never },
      },
      {
        type: "store",
        availability: { type: "season", seasons: ["summer"] },
        storeId: "general" as never,
        visibility: { type: "questAvailable", questId: "repair" as never },
      },
      { type: "store", storeId: "general" as never },
    ];
    const first = new RecipeSourceAccumulator();
    const reversed = new RecipeSourceAccumulator();
    for (const source of paths) first.add(target, source);
    for (const source of paths.toReversed()) reversed.add(target, source);
    expect(first.get(target)).toEqual(reversed.get(target));
    expect(first.get(target)).toHaveLength(3);
    expect(first.get(target)).toContainEqual(paths[0]);
    expect(first.get(target)).toContainEqual(paths[1]);
  });

  it("replaces sources for only the selected target", () => {
    const accumulator = new ItemSourceAccumulator();
    accumulator.add("void_herb" as ItemId, {
      type: "mine",
      biomeId: "ancient_ruins" as MinesBiomeId,
    });
    accumulator.add("other_item" as ItemId, { type: "default" });

    accumulator.replace("void_herb" as ItemId, [
      { type: "forage", locationIds: ["mines" as never] },
    ]);

    expect(accumulator.get("void_herb" as ItemId)).toEqual([
      { type: "forage", locationIds: ["mines"] },
    ]);
    expect(accumulator.get("other_item" as ItemId)).toEqual([{ type: "default" }]);
  });
});
