import { describe, expect, it } from "vitest";

import { makeFiddle as makeFiddleBase } from "../../test-helpers.js";
import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "../source-accumulator.js";
import { collectExplorationSources } from "./exploration.js";

import type { CosmeticId, ItemId } from "$lib/types/tracker-data.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({
    artifacts: {},
    dungeons: {},
    fishing: {},
    museum_wings: {},
    ...overrides,
  });
}

describe("collectExplorationSources", () => {
  describe("mine biome sources", () => {
    it("adds mine sources for biome armor items", () => {
      const fiddle = makeFiddle({
        dungeons: {
          biomes: [
            {
              armor: ["scrap_metal_helmet", "scrap_metal_chestpiece"],
              name: "Upper Mines",
            },
          ],
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("scrap_metal_helmet" as ItemId)).toEqual([
        { type: "mine", biomeId: "upper_mines" },
      ]);
      expect(acc.get("scrap_metal_chestpiece" as ItemId)).toEqual([
        { type: "mine", biomeId: "upper_mines" },
      ]);
    });

    it("adds mine sources for biome cosmetics", () => {
      const fiddle = makeFiddle({
        dungeons: {
          biomes: [
            {
              cosmetics: ["head_miners_helmet"],
              name: "Upper Mines",
            },
          ],
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(cosAcc.get("head_miners_helmet" as CosmeticId)).toEqual([
        { type: "mine", biomeId: "upper_mines" },
      ]);
    });

    it("adds mine sources for biome furniture", () => {
      const fiddle = makeFiddle({
        dungeons: {
          biomes: [
            {
              furniture: ["miners_copper_node"],
              name: "Upper Mines",
            },
          ],
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("miners_copper_node" as ItemId)).toEqual([
        { type: "mine", biomeId: "upper_mines" },
      ]);
    });

    it("adds mine sources for dungeon delicacies", () => {
      const fiddle = makeFiddle({
        dungeons: {
          biomes: [
            {
              dungeon_delicacies: ["baked_sweetroot"],
              name: "Upper Mines",
            },
          ],
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("baked_sweetroot" as ItemId)).toEqual([
        { type: "mine", biomeId: "upper_mines" },
      ]);
    });

    it("uses descriptive biome IDs derived from names", () => {
      const fiddle = makeFiddle({
        dungeons: {
          biomes: [
            { armor: ["item_a"], name: "Upper Mines" },
            { armor: ["item_b"], name: "The Tide Caverns" },
          ],
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("item_a" as ItemId)).toEqual([{ type: "mine", biomeId: "upper_mines" }]);
      expect(acc.get("item_b" as ItemId)).toEqual([{ type: "mine", biomeId: "tide_caverns" }]);
    });
  });

  describe("fishing chest sources", () => {
    it("adds treasure_chest sources for item entries", () => {
      const fiddle = makeFiddle({
        fishing: {
          chest_tables: {
            wood: {
              items: [{ kind: "item", value: "canned_sardines" }],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("canned_sardines" as ItemId)).toEqual([
        { type: "treasure_chest", tier: "wood" },
      ]);
    });

    it("adds treasure_chest sources for cosmetic entries to cosmetic accumulator", () => {
      const fiddle = makeFiddle({
        fishing: {
          chest_tables: {
            abyss: {
              items: [
                { cosmetic: "back_gear_ancient_witch_broom", kind: "cosmetic", value: "cosmetic" },
              ],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(cosAcc.get("back_gear_ancient_witch_broom" as CosmeticId)).toEqual([
        { type: "treasure_chest", tier: "abyss" },
      ]);
    });

    it("skips recipe entries in fishing chests", () => {
      const fiddle = makeFiddle({
        fishing: {
          chest_tables: {
            wood: {
              items: [
                { kind: "item", value: "canned_sardines" },
                { kind: "recipe", value: "canned_sardines" },
              ],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("canned_sardines" as ItemId)).toEqual([
        { type: "treasure_chest", tier: "wood" },
      ]);
    });

    it("handles multiple tiers", () => {
      const fiddle = makeFiddle({
        fishing: {
          chest_tables: {
            copper: { items: [{ kind: "item", value: "ore_sapphire" }] },
            wood: { items: [{ kind: "item", value: "seaweed" }] },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("seaweed" as ItemId)).toEqual([{ type: "treasure_chest", tier: "wood" }]);
      expect(acc.get("ore_sapphire" as ItemId)).toEqual([
        { type: "treasure_chest", tier: "copper" },
      ]);
    });
  });

  describe("artifact dig sources", () => {
    it("adds artifact_dig sources for all loot entries", () => {
      const fiddle = makeFiddle({
        artifacts: {
          loot: {
            peat: "common",
            sod: "common",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("peat" as ItemId)).toEqual([{ type: "artifact_dig" }]);
      expect(acc.get("sod" as ItemId)).toEqual([{ type: "artifact_dig" }]);
    });

    it("includes location IDs when artifact belongs to a location set", () => {
      const fiddle = makeFiddle({
        artifacts: {
          locations: {
            narrows: "aldarian",
          },
          loot: {
            aldarian_sword: "uncommon",
            peat: "common",
          },
        },
        museum_wings: {
          archaeology: {
            sets: {
              aldarian: {
                items: ["aldarian_sword", "family_crest_pendant"],
              },
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("aldarian_sword" as ItemId)).toEqual([
        { type: "artifact_dig", locationIds: ["narrows"] },
      ]);
      expect(acc.get("peat" as ItemId)).toEqual([{ type: "artifact_dig" }]);
    });

    it("handles empty loot table", () => {
      const fiddle = makeFiddle({
        artifacts: { loot: {} },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);
      expect(acc.entries().length).toBe(0);
    });
  });
});
