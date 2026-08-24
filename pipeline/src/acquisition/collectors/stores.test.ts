import { describe, expect, it } from "vitest";

import { createRequirementContext } from "../../requirements.js";
import { makeFiddle as makeFiddleBase } from "../../test-helpers.js";
import { ItemSourceAccumulator } from "../source-accumulator.js";
import { collectStoreSources } from "./stores.js";

import type { ItemId } from "$lib/types/tracker-data.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ requirements: {}, stores: {}, ...overrides });
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

    expect(acc.get("wood" as ItemId)).toEqual([{ type: "store", storeId: "general" }]);
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
        type: "store",
        availability: { type: "season", seasons: ["spring"] },
        storeId: "general",
      },
    ]);
  });

  it("projects upgrade requirements as availability conditions on store sources", () => {
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
        type: "store",
        availability: {
          type: "all",
          conditions: expect.arrayContaining([{ type: "season", seasons: ["spring"] }]),
        },
        storeId: "general",
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
      type: "store",
      storeId: "general",
    });
    expect(sources[0]).not.toHaveProperty("perkId");
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

    expect(acc.get("fancy_hat" as ItemId)).toEqual([{ type: "store", storeId: "clothing" }]);
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
