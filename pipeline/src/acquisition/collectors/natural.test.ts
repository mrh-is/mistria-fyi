import { describe, expect, it } from "vitest";

import { ItemSourceAccumulator } from "../source-accumulator.js";
import { collectNaturalSources } from "./natural.js";

import type { ItemId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    bugs: {},
    fish: {},
    forageables: {},
    items: {},
    monsters: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("collectNaturalSources", () => {
  describe("fish", () => {
    it("adds a fish source with season, weather, time, and water type", () => {
      const fiddle = makeFiddle({
        fish: {
          bass: {
            hours: [6, 18],
            item: "bass",
            seasons: ["spring", "summer"],
            water_type: ["river"],
            weather: ["calm"],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);

      expect(acc.get("bass" as ItemId)).toEqual([
        {
          type: "fish",
          availability: {
            type: "all",
            conditions: [
              { type: "season", seasons: ["spring", "summer"] },
              { type: "weather", weathers: ["calm"] },
              { type: "time", start: 6, end: 18 },
            ],
          },
          waterTypes: ["river"],
        },
      ]);
    });

    it("uses the item field as target ID when present", () => {
      const fiddle = makeFiddle({
        fish: {
          bass_medium: {
            item: "bass",
            size: "medium",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("bass" as ItemId).length).toBe(1);
    });

    it("adds a dive source for divespot retrieval", () => {
      const fiddle = makeFiddle({
        fish: {
          sea_urchin: {
            retrieval: ["divespot"],
            water_type: ["ocean"],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("sea_urchin" as ItemId)).toEqual([{ type: "dive", waterTypes: ["ocean"] }]);
    });

    it("adds a fish_trap source for fishtrap retrieval", () => {
      const fiddle = makeFiddle({
        fish: {
          crab: {
            retrieval: ["fishtrap"],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("crab" as ItemId)).toEqual([{ type: "fish_trap" }]);
    });

    it("skips chest fish entries", () => {
      const fiddle = makeFiddle({
        fish: {
          treasure_chest: {
            is_chest: true,
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("treasure_chest" as ItemId)).toEqual([]);
    });
  });

  describe("bugs", () => {
    it("adds a bug_catch source with location, season, weather, and time", () => {
      const fiddle = makeFiddle({
        bugs: {
          butterfly: {
            hours: [8, 16],
            locations: ["meadow", "forest"],
            seasons: ["spring"],
            weather: ["calm"],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);

      expect(acc.get("butterfly" as ItemId)).toEqual([
        {
          type: "bug_catch",
          availability: {
            type: "all",
            conditions: [
              { type: "season", seasons: ["spring"] },
              { type: "weather", weathers: ["calm"] },
              { type: "time", start: 8, end: 16 },
            ],
          },
          locationIds: ["meadow", "forest"],
        },
      ]);
    });
  });

  describe("forage", () => {
    it("adds a forage source for non-seasonal entries", () => {
      const fiddle = makeFiddle({
        forageables: {
          anywhere: ["mushroom"],
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("mushroom" as ItemId)).toEqual([{ type: "forage" }]);
    });

    it("adds a seasonal forage source", () => {
      const fiddle = makeFiddle({
        forageables: {
          spring: {
            common: ["dandelion"],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("dandelion" as ItemId)).toEqual([
        { type: "forage", availability: { type: "season", seasons: ["spring"] } },
      ]);
    });

    it("handles object entries with item field", () => {
      const fiddle = makeFiddle({
        forageables: {
          spring: {
            rare: [{ item: "truffle" }],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("truffle" as ItemId)).toEqual([
        { type: "forage", availability: { type: "season", seasons: ["spring"] } },
      ]);
    });
  });

  describe("crops", () => {
    it("adds a crop source referencing the seed", () => {
      const fiddle = makeFiddle({
        items: {
          other: {
            crops_and_forage: {
              default: {},
              tomato: {
                crop_object: "tomato_plant",
                name: "Tomato",
                tags: ["crop"],
              },
              tomato_seeds: {
                crop_object: "tomato",
                name: "Tomato Seeds",
                seasons: ["summer"],
                tags: ["seed"],
              },
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);

      expect(acc.get("tomato" as ItemId)).toEqual([
        {
          type: "crop",
          availability: { type: "season", seasons: ["summer"] },
          seedItemId: "tomato_seeds",
        },
      ]);
    });
  });

  describe("trees", () => {
    it("adds a tree source referencing the sapling", () => {
      const fiddle = makeFiddle({
        items: {
          other: {
            crops_and_forage: {
              apple_sapling: {
                name: "Apple Sapling",
                tags: ["sapling"],
                tree_product: "apple",
              },
              default: {},
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);

      expect(acc.get("apple" as ItemId)).toEqual([
        { type: "tree", saplingItemId: "apple_sapling" },
      ]);
    });
  });

  describe("monsters", () => {
    it("adds a monster source with the monster ID", () => {
      const fiddle = makeFiddle({
        monsters: {
          slimes: {
            blue_slime: {
              drops: [{ item: "slime_goo" }],
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);

      expect(acc.get("slime_goo" as ItemId)).toEqual([
        { type: "monster", monsterId: "blue_slime" },
      ]);
    });

    it("skips default and non-object monsters", () => {
      const fiddle = makeFiddle({
        monsters: {
          slimes: {
            default: { drops: [{ item: "should_skip" }] },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("should_skip" as ItemId)).toEqual([]);
    });
  });

  describe("animal products", () => {
    it("adds an animal_product source with the animal ID", () => {
      const fiddle = makeFiddle({
        items: {
          other: {
            ranching: {
              default: {},
              egg: {
                animal_product: "chicken",
                name: "Egg",
                tags: ["animal_product"],
              },
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);

      expect(acc.get("egg" as ItemId)).toEqual([{ type: "animal_product", animalId: "chicken" }]);
    });
  });
});
