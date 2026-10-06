import { describe, expect, it } from "vitest";

import { makeFiddle as makeFiddleBase } from "../../test-helpers.js";
import { ItemSourceAccumulator } from "../source-accumulator.js";
import { buildBaitRanges, buildFishBiomeMap, collectNaturalSources } from "./natural.js";

import type { ItemId } from "#lib/types/tracker-data.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({
    bugs: {},
    fish: {},
    forageables: {},
    items: {},
    monsters: {},
    ...overrides,
  });
}

describe("collectNaturalSources", () => {
  it("rejects mines forageables without a biome", () => {
    const fiddle = makeFiddle({
      items: { other: { materials: { mystery_herb: { tags: ["mines_forageable"] } } } },
    });
    expect(() => {
      collectNaturalSources(fiddle, new ItemSourceAccumulator());
    }).toThrow(/biome-less-forageable.*mystery_herb/);
  });

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
      expect(acc.get("bass" as ItemId)).toHaveLength(1);
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

    it("adds a fish_trap source with bait item IDs for fish_trap retrieval", () => {
      const fiddle = makeFiddle({
        fish: {
          crab: {
            rarity: "common",
            retrieval: "fish_trap",
          },
        },
        items: {
          other: {
            apiaries_and_terrariums: {
              fish_bait_common: {
                attract: { max_rarity: "common", min_rarity: 10_000 },
                tags: ["fish_bait"],
              },
              fish_bait_uncommon: {
                attract: { max_rarity: "uncommon", min_rarity: "common" },
                tags: ["fish_bait"],
              },
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("crab" as ItemId)).toEqual([
        { type: "fish_trap", baitItemIds: ["fish_bait_common", "fish_bait_uncommon"] },
      ]);
    });

    it("adds both fish and dive sources for fishing+divespot retrieval", () => {
      const fiddle = makeFiddle({
        fish: {
          salmon: {
            retrieval: ["fishing", "divespot"],
            seasons: ["spring"],
            water_type: ["river"],
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("salmon" as ItemId)).toEqual([
        {
          type: "fish",
          availability: { type: "season", seasons: ["spring"] },
          waterTypes: ["river"],
        },
        { type: "dive", waterTypes: ["river"] },
      ]);
    });

    it("adds a bait_fish source for bait_only fish", () => {
      const fiddle = makeFiddle({
        fish: {
          massive_minnow: {
            bait_only: true,
            rarity: "very_very_common",
            retrieval: ["fishing", "mines"],
            seasons: ["spring", "summer", "fall", "winter"],
            water_type: ["pond", "river", "ocean"],
          },
        },
        items: {
          other: {
            apiaries_and_terrariums: {
              fish_bait_common: {
                attract: { max_rarity: "common", min_rarity: 10_000 },
                tags: ["fish_bait"],
              },
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("massive_minnow" as ItemId)).toEqual([
        { type: "bait_fish", baitItemIds: ["fish_bait_common"] },
      ]);
    });

    it("adds a mine_fish source with biome ID for mines retrieval", () => {
      const fiddle = makeFiddle({
        dungeons: {
          dungeons: {
            biomes: [
              {
                name: "Deep Earth",
                votes: {
                  fish: [{ object: "cave_eel", votes: 30 }],
                },
              },
            ],
          },
        },
        fish: {
          cave_eel: {
            retrieval: "mines",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("cave_eel" as ItemId)).toEqual([{ type: "mine_fish", biomeId: "deep_earth" }]);
    });

    it("throws for bait_only fish without fishing+mines retrieval", () => {
      const fiddle = makeFiddle({
        fish: {
          bad_fish: {
            bait_only: true,
            rarity: "common",
            retrieval: ["fishing"],
          },
        },
        items: {
          other: {
            apiaries_and_terrariums: {
              fish_bait_common: {
                attract: { max_rarity: "common", min_rarity: 10_000 },
                tags: ["fish_bait"],
              },
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      expect(() => {
        collectNaturalSources(fiddle, acc);
      }).toThrow(/bait_only fish "bad_fish" has unexpected retrieval/);
    });

    it("adds a mine_fish source without biome when fish is not in any dungeon biome", () => {
      const fiddle = makeFiddle({
        dungeons: { dungeons: { biomes: [] } },
        fish: {
          mystery_fish: {
            retrieval: "mines",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      collectNaturalSources(fiddle, acc);
      expect(acc.get("mystery_fish" as ItemId)).toEqual([{ type: "mine_fish" }]);
    });

    it("throws for fish_trap with extra retrieval methods", () => {
      const fiddle = makeFiddle({
        fish: {
          odd_crab: {
            rarity: "common",
            retrieval: ["fish_trap", "divespot"],
          },
        },
        items: {
          other: {
            apiaries_and_terrariums: {
              fish_bait_common: {
                attract: { max_rarity: "common", min_rarity: 10_000 },
                tags: ["fish_bait"],
              },
            },
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      expect(() => {
        collectNaturalSources(fiddle, acc);
      }).toThrow(/fish_trap fish "odd_crab" has unexpected extra retrieval/);
    });

    it("throws for unknown retrieval methods", () => {
      const fiddle = makeFiddle({
        fish: {
          weird_fish: {
            retrieval: "teleportation",
          },
        },
      });

      const acc = new ItemSourceAccumulator();
      expect(() => {
        collectNaturalSources(fiddle, acc);
      }).toThrow(/fish "weird_fish" has unknown retrieval methods: \[teleportation\]/);
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

describe("buildBaitRanges", () => {
  it("extracts bait ranges from items with fish_bait tag", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          apiaries_and_terrariums: {
            fish_bait_common: {
              attract: { max_rarity: "common", min_rarity: 10_000 },
              tags: ["fish_bait"],
            },
            fish_bait_rare: {
              attract: { max_rarity: "rare", min_rarity: "uncommon" },
              tags: ["fish_bait"],
            },
            honeycomb: {
              tags: ["crop"],
            },
          },
        },
      },
    });

    const ranges = buildBaitRanges(fiddle);
    expect(ranges).toEqual([
      { itemId: "fish_bait_common", maxIdx: 4, minIdx: 0 },
      { itemId: "fish_bait_rare", maxIdx: 6, minIdx: 5 },
    ]);
  });

  it("skips items without attract data", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          apiaries_and_terrariums: {
            fish_bait_broken: {
              tags: ["fish_bait"],
            },
          },
        },
      },
    });

    expect(buildBaitRanges(fiddle)).toEqual([]);
  });

  it("returns empty array when no bait items exist", () => {
    const fiddle = makeFiddle({});
    expect(buildBaitRanges(fiddle)).toEqual([]);
  });
});

describe("buildFishBiomeMap", () => {
  it("maps fish objects to biome IDs", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [
            {
              name: "Upper Mines",
              votes: {
                fish: [
                  { object: "rock_guppy", votes: 30 },
                  { object: "cave_eel", votes: 18 },
                ],
              },
            },
            {
              name: "The Lava Caves",
              votes: {
                fish: [{ object: "lava_piranha", votes: 30 }],
              },
            },
          ],
        },
      },
    });

    const map = buildFishBiomeMap(fiddle);
    expect(map.get("rock_guppy")).toBe("upper_mines");
    expect(map.get("cave_eel")).toBe("upper_mines");
    expect(map.get("lava_piranha")).toBe("lava_caves");
    expect(map.size).toBe(3);
  });

  it("strips 'The' prefix from biome names", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [
            {
              name: "The Tide Caverns",
              votes: {
                fish: [{ object: "jellyfish", votes: 10 }],
              },
            },
          ],
        },
      },
    });

    const map = buildFishBiomeMap(fiddle);
    expect(map.get("jellyfish")).toBe("tide_caverns");
  });

  it("returns empty map when no dungeons data exists", () => {
    const fiddle = makeFiddle({});
    expect(buildFishBiomeMap(fiddle).size).toBe(0);
  });
});
