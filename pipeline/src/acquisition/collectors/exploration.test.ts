import { describe, expect, it } from "vitest";

import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "../source-accumulator.js";
import { collectExplorationSources } from "./exploration.js";

import type { CosmeticId, ItemId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    artifacts: {},
    dungeons: {},
    fishing: {},
    museum_wings: {},
    ...overrides,
  } as unknown as ParsedGameData;
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
        { biomeId: "biome_0", type: "mine" },
      ]);
      expect(acc.get("scrap_metal_chestpiece" as ItemId)).toEqual([
        { biomeId: "biome_0", type: "mine" },
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
        { biomeId: "biome_0", type: "mine" },
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
        { biomeId: "biome_0", type: "mine" },
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

      expect(acc.get("baked_sweetroot" as ItemId)).toEqual([{ biomeId: "biome_0", type: "mine" }]);
    });

    it("uses sequential biome IDs", () => {
      const fiddle = makeFiddle({
        dungeons: {
          biomes: [
            { armor: ["item_a"], name: "Biome A" },
            { armor: ["item_b"], name: "Biome B" },
          ],
        },
      });

      const acc = new ItemSourceAccumulator();
      const cosAcc = new CosmeticSourceAccumulator();
      collectExplorationSources(fiddle, acc, cosAcc);

      expect(acc.get("item_a" as ItemId)).toEqual([{ biomeId: "biome_0", type: "mine" }]);
      expect(acc.get("item_b" as ItemId)).toEqual([{ biomeId: "biome_1", type: "mine" }]);
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
        { tier: "wood", type: "treasure_chest" },
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
        { tier: "abyss", type: "treasure_chest" },
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
        { tier: "wood", type: "treasure_chest" },
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

      expect(acc.get("seaweed" as ItemId)).toEqual([{ tier: "wood", type: "treasure_chest" }]);
      expect(acc.get("ore_sapphire" as ItemId)).toEqual([
        { tier: "copper", type: "treasure_chest" },
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
        { locationIds: ["narrows"], type: "artifact_dig" },
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
