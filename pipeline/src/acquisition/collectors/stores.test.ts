import { describe, expect, it } from "vitest";

import { createRequirementContext } from "../../requirements.js";
import { ItemSourceAccumulator } from "../source-accumulator.js";
import { collectStoreSources } from "./stores.js";

import type { ItemId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    requirements: {},
    stores: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

const defaultContext = createRequirementContext({});

describe("collectStoreSources", () => {
  it("adds a store source for constant stock string entries", () => {
    const fiddle = makeFiddle({
      stores: {
        general: {
          categories: [{ constant_stock: ["wood"] }],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    expect(acc.get("wood" as ItemId)).toEqual([{ storeId: "general", type: "store" }]);
  });

  it("adds seasonal availability for seasonal stock", () => {
    const fiddle = makeFiddle({
      stores: {
        general: {
          categories: [
            {
              seasonal: {
                spring: ["seed_turnip"],
              },
            },
          ],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    expect(acc.get("seed_turnip" as ItemId)).toEqual([
      {
        availability: { seasons: ["spring"], type: "season" },
        storeId: "general",
        type: "store",
      },
    ]);
  });

  it("marks random stock with chance: 0", () => {
    const fiddle = makeFiddle({
      stores: {
        general: {
          categories: [{ random_stock: [{ item: "mystery_box" }] }],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    expect(acc.get("mystery_box" as ItemId)).toEqual([
      { chance: 0, storeId: "general", type: "store" },
    ]);
  });

  it("projects upgrade requirements as upgrade sources", () => {
    const fiddle = makeFiddle({
      stores: {
        general: {
          categories: [
            {
              seasonal: {
                spring: [{ item: "seed_carrot", requirements: { repaired_general_store: true } }],
              },
            },
          ],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    const sources = acc.get("seed_carrot" as ItemId);
    expect(sources).toEqual([
      {
        availability: {
          conditions: expect.arrayContaining([{ seasons: ["spring"], type: "season" }]),
          type: "all",
        },
        storeId: "general",
        type: "upgrade",
        upgradeName: "repaired_general_store",
      },
    ]);
  });

  it("projects perk requirements as perk-gated store sources", () => {
    const fiddle = makeFiddle({
      stores: {
        general: {
          categories: [
            {
              constant_stock: [{ item: "perk_item", requirements: { has_perk: "taste_maker" } }],
            },
          ],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    const sources = acc.get("perk_item" as ItemId);
    expect(sources.length).toBe(1);
    expect(sources[0]).toMatchObject({
      perkId: "taste_maker",
      storeId: "general",
      type: "store",
    });
  });

  it("skips recipe and crafting scrolls", () => {
    const fiddle = makeFiddle({
      stores: {
        general: {
          categories: [
            {
              constant_stock: [
                { item: "real_item" },
                { recipe_scroll: "some_recipe" },
                { crafting_scroll: "some_craft" },
              ],
            },
          ],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    expect(acc.get("real_item" as ItemId).length).toBe(1);
  });

  it("handles cosmetic stock entries", () => {
    const fiddle = makeFiddle({
      stores: {
        clothing: {
          categories: [{ constant_stock: [{ cosmetic: "fancy_hat" }] }],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    expect(acc.get("fancy_hat" as ItemId)).toEqual([{ storeId: "clothing", type: "store" }]);
  });

  it("skips default store entries", () => {
    const fiddle = makeFiddle({
      stores: {
        default: {
          categories: [{ constant_stock: ["skip_me"] }],
        },
        general: {
          categories: [{ constant_stock: ["keep_me"] }],
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    collectStoreSources(fiddle, defaultContext, acc);

    expect(acc.get("skip_me" as ItemId)).toEqual([]);
    expect(acc.get("keep_me" as ItemId).length).toBe(1);
  });
});
