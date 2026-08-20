import { describe, expect, it } from "vitest";

import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "../source-accumulator.js";
import { collectRewardSources } from "./rewards.js";

import type { CosmeticId, ItemId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    cutscenes: {},
    dates: {},
    festivals: {},
    letters: {},
    museum_wings: {},
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
        { type: "quest", questId: "gather_wood", trigger: "completion" },
      ]);
    });

    it("adds a quest source for player_cosmetic rewards", () => {
      const fiddle = makeFiddle({
        quests: {
          story_quests: {
            the_spring_festival: {
              rewards: [{ player_cosmetic: "head_special_flower_crown" }],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosmeticAcc = new CosmeticSourceAccumulator();
      collectRewardSources(fiddle, acc, cosmeticAcc);

      expect(cosmeticAcc.get("head_special_flower_crown" as CosmeticId)).toEqual([
        { type: "quest", questId: "the_spring_festival", trigger: "completion" },
      ]);
    });

    it("handles tiered quest rewards", () => {
      const fiddle = makeFiddle({
        quests: {
          story_quests: {
            the_spring_festival: {
              rewards: [
                {
                  tiers: [
                    { required_score: 10, rewards: [{ item: "spring_planter" }] },
                    { required_score: 50, rewards: [{ player_cosmetic: "flower_crown" }] },
                  ],
                },
              ],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosmeticAcc = new CosmeticSourceAccumulator();
      collectRewardSources(fiddle, acc, cosmeticAcc);

      expect(acc.get("spring_planter" as ItemId)).toEqual([
        { type: "quest", questId: "the_spring_festival", trigger: "completion" },
      ]);
      expect(cosmeticAcc.get("flower_crown" as CosmeticId)).toEqual([
        { type: "quest", questId: "the_spring_festival", trigger: "completion" },
      ]);
    });

    it("handles staged quest rewards", () => {
      const fiddle = makeFiddle({
        quests: {
          story_quests: {
            multi_stage: {
              rewards: [],
              stages: [
                { rewards: [{ item: "stage_1_reward" }] },
                { rewards: [{ item: "stage_2_reward" }] },
              ],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("stage_1_reward" as ItemId)).toEqual([
        { type: "quest", questId: "multi_stage", trigger: "completion" },
      ]);
      expect(acc.get("stage_2_reward" as ItemId)).toEqual([
        { type: "quest", questId: "multi_stage", trigger: "completion" },
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
          type: "festival",
          availability: { type: "season", seasons: ["spring"] },
          festivalId: "spring",
          storeId: "vendor_a",
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
          type: "festival",
          availability: { type: "season", seasons: ["summer"] },
          festivalId: "summer",
          storeId: "vendor",
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

      expect(acc.get("bronze_medal" as ItemId)).toEqual([{ type: "renown", level: 1 }]);
      expect(acc.get("silver_hat" as ItemId)).toEqual([{ type: "renown", level: 2 }]);
      expect(acc.get("gold_trophy" as ItemId)).toEqual([{ type: "renown", level: 3 }]);
    });
  });

  describe("letter rewards", () => {
    it("adds a letter source for shipped_item trigger with recipe scroll", () => {
      const fiddle = makeFiddle({
        letters: {
          baked_potato_recipe: {
            items: [{ recipe_scroll: "baked_potato" }],
            npc: "nora",
            requirements: { shipped_item: "potato" },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("baked_potato" as ItemId)).toEqual([
        { type: "letter", trigger: "shipped_item", triggerItemId: "potato" },
      ]);
    });

    it("adds a letter source for donated_item trigger", () => {
      const fiddle = makeFiddle({
        letters: {
          mushroom_stew: {
            items: [{ recipe_scroll: "miners_mushroom_stew" }],
            requirements: { donated_item: "upper_mines_mushroom" },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("miners_mushroom_stew" as ItemId)).toEqual([
        { type: "letter", trigger: "donated_item", triggerItemId: "upper_mines_mushroom" },
      ]);
    });

    it("adds a letter source for reached_date trigger", () => {
      const fiddle = makeFiddle({
        letters: {
          spring_letter: {
            items: [{ count: 1, item_name: "gift_box" }],
            requirements: { reached_date: { day: 5, season: "spring" } },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("gift_box" as ItemId)).toEqual([
        {
          type: "letter",
          trigger: "reached_date",
          triggerDate: { day: 5, season: "spring" },
        },
      ]);
    });

    it("adds a letter source for item_name entries", () => {
      const fiddle = makeFiddle({
        letters: {
          adeline_reward: {
            items: [
              { count: 25, item_name: "basic_wood" },
              { count: 25, item_name: "ore_stone" },
            ],
            requirements: { world_fact_is: { adeline_4h_materials: true } },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("basic_wood" as ItemId).length).toBe(1);
      expect(acc.get("ore_stone" as ItemId).length).toBe(1);
    });

    it("skips letters with empty items array", () => {
      const fiddle = makeFiddle({
        letters: {
          empty_letter: {
            items: [],
            requirements: { reached_date: { day: 1, season: "spring" } },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);
      expect(acc.entries().length).toBe(0);
    });
  });

  describe("museum donation rewards", () => {
    it("adds museum_donation sources at sequential set counts", () => {
      const fiddle = makeFiddle({
        museum_wings: {
          archaeology: {
            rewards: [
              { entries: [{ item: "treasure_box_wood" }, { cosmetic: "head_explorer_hat" }] },
              { entries: [{ item: "treasure_box_copper" }] },
            ],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("treasure_box_wood" as ItemId)).toEqual([
        { type: "museum_donation", setCount: 1, wingId: "archaeology" },
      ]);
      expect(acc.get("head_explorer_hat" as ItemId)).toEqual([
        { type: "museum_donation", setCount: 1, wingId: "archaeology" },
      ]);
      expect(acc.get("treasure_box_copper" as ItemId)).toEqual([
        { type: "museum_donation", setCount: 2, wingId: "archaeology" },
      ]);
    });

    it("skips crafting_scroll and recipe_scroll entries", () => {
      const fiddle = makeFiddle({
        museum_wings: {
          archaeology: {
            rewards: [
              {
                entries: [{ item: "explorer_bed" }, { crafting_scroll: "explorer_bed" }],
              },
            ],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      const all = acc.entries();
      expect(all.length).toBe(1);
      expect(all[0][0]).toBe("explorer_bed");
    });

    it("handles multiple wings", () => {
      const fiddle = makeFiddle({
        museum_wings: {
          archaeology: {
            rewards: [{ entries: [{ item: "arch_reward" }] }],
          },
          fish: {
            rewards: [{ entries: [{ item: "fish_reward" }] }],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("arch_reward" as ItemId)).toEqual([
        { type: "museum_donation", setCount: 1, wingId: "archaeology" },
      ]);
      expect(acc.get("fish_reward" as ItemId)).toEqual([
        { type: "museum_donation", setCount: 1, wingId: "fish" },
      ]);
    });
  });

  describe("proposal sources (10-heart items)", () => {
    it("adds proposal sources from _ten_hearts cutscenes", () => {
      const fiddle = makeFiddle({
        cutscenes: {
          adeline_ten_hearts: {
            given_items: [{ item_id: "adelines_lifetime_planner" }],
            romantic_choice_warning: "adeline",
          },
          balor_ten_hearts: {
            given_items: [{ item_id: "balors_polished_gem" }],
            romantic_choice_warning: "balor",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("adelines_lifetime_planner" as ItemId)).toEqual([
        { type: "proposal", npcId: "adeline" },
      ]);
      expect(acc.get("balors_polished_gem" as ItemId)).toEqual([
        { type: "proposal", npcId: "balor" },
      ]);
    });

    it("does not match non-ten-heart cutscenes", () => {
      const fiddle = makeFiddle({
        cutscenes: {
          some_other_scene: {
            given_items: [{ item_id: "random_item" }],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);
      expect(acc.get("random_item" as ItemId)).toEqual([]);
    });
  });

  describe("date sources", () => {
    it("adds date sources for photo items", () => {
      const fiddle = makeFiddle({
        dates: {
          deep_woods_picnic: {
            photo_item: "date_photo_deep_woods",
          },
          inn_meal: {
            photo_item: "date_photo_inn",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("date_photo_inn" as ItemId)).toEqual([{ type: "date", dateId: "inn_meal" }]);
      expect(acc.get("date_photo_deep_woods" as ItemId)).toEqual([
        { type: "date", dateId: "deep_woods_picnic" },
      ]);
    });

    it("skips default and placeholder photo items", () => {
      const fiddle = makeFiddle({
        dates: {
          default: {
            photo_item: "<n/a>",
          },
          no_photo: {
            photo_item: "<n/a>",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);
      expect(acc.entries().length).toBe(0);
    });
  });

  describe("engagement and wedding sources", () => {
    it("adds engagement source for engagement_tutorial given items", () => {
      const fiddle = makeFiddle({
        cutscenes: {
          engagement_tutorial: {
            given_items: [{ item_id: "engagement_ring_recipe_scroll" }],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);

      expect(acc.get("engagement_ring_recipe_scroll" as ItemId)).toEqual([{ type: "engagement" }]);
    });

    it("handles wedding cutscene with no given items", () => {
      const fiddle = makeFiddle({
        cutscenes: {
          wedding: {},
        },
      });

      const acc = new ItemSourceAccumulator();
      collectRewardSources(fiddle, acc);
      expect(acc.entries().length).toBe(0);
    });
  });
});
