import { describe, expect, it } from "vitest";

import { ItemSourceAccumulator } from "../source-accumulator.js";
import { collectRewardSources } from "./rewards.js";

import type { ItemId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    festivals: {},
    quests: {},
    renown: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("collectRewardSources", () => {
  describe("quest rewards", () => {
    it("adds a quest source for item rewards", () => {
      const fiddle = makeFiddle({
        quests: {
          fetch_quests: {
            gather_wood: {
              rewards: [{ item: "axe" }],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("axe" as ItemId)).toEqual([
        { questId: "gather_wood", trigger: "completion", type: "quest" },
      ]);
    });

    it("skips default and non-object quests", () => {
      const fiddle = makeFiddle({
        quests: {
          fetch_quests: {
            default: { rewards: [{ item: "skip_this" }] },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);
      expect(acc.get("skip_this" as ItemId)).toEqual([]);
    });
  });

  describe("festival stock", () => {
    it("adds a festival source with festival and store IDs", () => {
      const fiddle = makeFiddle({
        festivals: {
          spring: {
            stocks: {
              vendor_a: [{ item: "flower_crown" }],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("flower_crown" as ItemId)).toEqual([
        {
          availability: { seasons: ["spring"], type: "season" },
          festivalId: "spring",
          storeId: "vendor_a",
          type: "festival",
        },
      ]);
    });

    it("includes cosmetic targets", () => {
      const fiddle = makeFiddle({
        festivals: {
          summer: {
            stocks: {
              vendor: [{ cosmetic: "sun_hat" }],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);
      expect(acc.get("sun_hat" as ItemId)).toEqual([
        {
          availability: { seasons: ["summer"], type: "season" },
          festivalId: "summer",
          storeId: "vendor",
          type: "festival",
        },
      ]);
    });
  });

  describe("renown rewards", () => {
    it("adds a renown source with the correct level", () => {
      const fiddle = makeFiddle({
        renown: {
          rewards: [{ item: "bronze_medal" }, { cosmetic: "silver_hat" }, { item: "gold_trophy" }],
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("bronze_medal" as ItemId)).toEqual([{ level: 1, type: "renown" }]);
      expect(acc.get("silver_hat" as ItemId)).toEqual([{ level: 2, type: "renown" }]);
      expect(acc.get("gold_trophy" as ItemId)).toEqual([{ level: 3, type: "renown" }]);
    });
  });
});
