import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { getName } from "$lib/data/names.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils.js";

import type { Source } from "$lib/types/acquisition.js";
import type { TrackerData } from "$lib/types/tracker-data.js";

// ─── Helpers ───────────────────────────────────────────────────────

function allSources(entity: { sources: [Source, ...Source[]] }): Source[] {
  return entity.sources;
}

// ─── Structural presence ───────────────────────────────────────────

describe("tracker data structural presence", () => {
  const requiredKeys: (keyof TrackerData)[] = [
    "almanac",
    "animals",
    "categoryVisibility",
    "cosmetics",
    "festivals",
    "generatedAt",
    "items",
    "mines",
    "museum",
    "npcs",
    "perkTierLevels",
    "pets",
    "quests",
    "recipes",
    "skills",
    "stores",
    "townRanks",
    "treasureChestTiers",
    "version",
  ];

  for (const key of requiredKeys) {
    it(`has "${key}" key`, () => {
      expect(trackerData).toHaveProperty(key);
    });
  }

  it("has a version string", () => {
    expect(typeof trackerData.version).toBe("string");
    expect(trackerData.version.length).toBeGreaterThan(0);
  });

  it("has a generatedAt timestamp", () => {
    expect(typeof trackerData.generatedAt).toBe("string");
    expect(trackerData.generatedAt.length).toBeGreaterThan(0);
  });
});

// ─── Non-empty collections ─────────────────────────────────────────

describe("non-empty collections", () => {
  it("has almanac categories", () => {
    expect(recordKeys(trackerData.almanac).length).toBeGreaterThan(0);
  });

  it("has animals", () => {
    expect(recordKeys(trackerData.animals).length).toBeGreaterThan(0);
  });

  it("has cosmetics", () => {
    expect(recordKeys(trackerData.cosmetics).length).toBeGreaterThan(0);
  });

  it("has festivals", () => {
    expect(recordKeys(trackerData.festivals).length).toBeGreaterThan(0);
  });

  it("has items", () => {
    expect(recordKeys(trackerData.items).length).toBeGreaterThan(0);
  });

  it("has mine biomes", () => {
    expect(trackerData.mines.biomes.length).toBeGreaterThan(0);
  });

  it("has mine spells", () => {
    expect(recordKeys(trackerData.mines.spells).length).toBeGreaterThan(0);
  });

  it("has museum wings", () => {
    expect(recordKeys(trackerData.museum).length).toBeGreaterThan(0);
  });

  it("has NPCs", () => {
    expect(recordKeys(trackerData.npcs).length).toBeGreaterThan(0);
  });

  it("has recipes", () => {
    expect(recordKeys(trackerData.recipes).length).toBeGreaterThan(0);
  });

  it("has skills", () => {
    expect(recordKeys(trackerData.skills).length).toBeGreaterThan(0);
  });

  it("has stores", () => {
    expect(recordKeys(trackerData.stores).length).toBeGreaterThan(0);
  });

  it("has town ranks", () => {
    expect(trackerData.townRanks.length).toBeGreaterThan(0);
  });

  it("has quest types with quests", () => {
    let totalQuests = 0;
    for (const questType of recordValues(trackerData.quests)) {
      totalQuests += recordKeys(questType).length;
    }
    expect(totalQuests).toBeGreaterThan(0);
  });
});

// ─── Source integrity ──────────────────────────────────────────────
// These tests validate runtime JSON, which is cast via `as unknown as TrackerData`.
// The type system says sources is always present, but these guards catch pipeline regressions.
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

describe("source integrity", () => {
  it("uses the reviewed Void Herb source in generated data", () => {
    expect(trackerData.items["void_herb" as keyof typeof trackerData.items]?.sources).toEqual([
      {
        type: "forage",
        availability: {
          type: "quest",
          questId: "find_the_magic_key",
          state: "completed",
        },
        locationIds: ["mines"],
        visibility: { type: "questAvailable", questId: "find_the_magic_key" },
      },
    ]);
  });

  it("every item has at least one source", () => {
    const missing: string[] = [];
    for (const [id, item] of recordEntries(trackerData.items)) {
      if (!item.sources || item.sources.length === 0) {
        missing.push(id);
      }
    }
    expect(missing, `Items without sources: ${missing.join(", ")}`).toEqual([]);
  });

  it("every recipe has at least one source", () => {
    const missing: string[] = [];
    for (const [id, recipe] of recordEntries(trackerData.recipes)) {
      if (!recipe.sources || recipe.sources.length === 0) {
        missing.push(id);
      }
    }
    expect(missing, `Recipes without sources: ${missing.join(", ")}`).toEqual([]);
  });

  it("every cosmetic has at least one source", () => {
    const missing: string[] = [];
    for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
      if (!cosmetic.sources || cosmetic.sources.length === 0) {
        missing.push(id);
      }
    }
    expect(missing, `Cosmetics without sources: ${missing.join(", ")}`).toEqual([]);
  });

  it("most mine spells have at least one source", () => {
    const withSources: string[] = [];
    for (const [id, spell] of recordEntries(trackerData.mines.spells)) {
      if (spell.sources && spell.sources.length > 0) {
        withSources.push(id);
      }
    }
    expect(withSources.length).toBeGreaterThan(0);
  });
});

/* eslint-enable @typescript-eslint/no-unnecessary-condition */

// ─── Reference integrity ──────────────────────────────────────────

describe("reference integrity", () => {
  const itemIds = new Set(recordKeys(trackerData.items));
  const npcIds = new Set(recordKeys(trackerData.npcs));
  const storeIds = new Set(recordKeys(trackerData.stores));

  it("almanac entries reference valid item IDs", () => {
    const invalid: string[] = [];
    for (const [catId, cat] of recordEntries(trackerData.almanac)) {
      for (const entry of cat.items) {
        for (const memberId of entry.itemIds) {
          if (!itemIds.has(memberId)) {
            invalid.push(`${catId}/${memberId}`);
          }
        }
      }
    }
    expect(invalid, `Invalid almanac item refs: ${invalid.join(", ")}`).toEqual([]);
  });

  it("museum wing sets reference valid item IDs", () => {
    const invalid: string[] = [];
    for (const [wingId, wing] of recordEntries(trackerData.museum)) {
      for (const [setId, set] of recordEntries(wing.sets)) {
        for (const itemId of set.items) {
          if (!itemIds.has(itemId)) {
            invalid.push(`${wingId}/${setId}/${itemId}`);
          }
        }
      }
    }
    expect(invalid, `Invalid museum item refs: ${invalid.join(", ")}`).toEqual([]);
  });

  it("store sources reference valid store IDs", () => {
    const invalid: string[] = [];
    for (const [itemId, item] of recordEntries(trackerData.items)) {
      for (const source of allSources(item)) {
        if (source.type === "store" && !storeIds.has(source.storeId)) {
          invalid.push(`${itemId} → store ${source.storeId}`);
        }
      }
    }
    expect(invalid, `Invalid store refs: ${invalid.join(", ")}`).toEqual([]);
  });

  it("NPC-referencing sources reference valid NPC IDs", () => {
    const invalid: string[] = [];
    for (const [itemId, item] of recordEntries(trackerData.items)) {
      for (const source of allSources(item)) {
        if ("npcId" in source && typeof source.npcId === "string" && !npcIds.has(source.npcId)) {
          invalid.push(`${itemId} → npc ${source.npcId}`);
        }
      }
    }
    expect(invalid, `Invalid NPC refs in item sources: ${invalid.join(", ")}`).toEqual([]);
  });

  // Runtime JSON is cast via `as unknown as TrackerData` — the type system says these lookups
  // always succeed, but these guards catch pipeline regressions where a foreign key is stale.
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  it("every fetch quest references a valid item", () => {
    const invalid: string[] = [];
    for (const [id, quest] of recordEntries(trackerData.quests.fetch)) {
      if (!trackerData.items[quest.itemId]) {
        invalid.push(`${id} → ${quest.itemId}`);
      }
    }
    expect(invalid, `Fetch quests referencing missing items: ${invalid.join(", ")}`).toEqual([]);
  });

  it("every heart quest references a valid NPC", () => {
    const invalid: string[] = [];
    for (const [id, quest] of recordEntries(trackerData.quests.heart)) {
      if (!trackerData.npcs[quest.npc]) {
        invalid.push(`${id} → ${quest.npc}`);
      }
    }
    expect(invalid, `Heart quests referencing missing NPCs: ${invalid.join(", ")}`).toEqual([]);
  });

  it("every cooking quest references a valid recipe", () => {
    const invalid: string[] = [];
    for (const [id, quest] of recordEntries(trackerData.quests.cooking)) {
      if (!trackerData.recipes[quest.recipeId]) {
        invalid.push(`${id} → ${quest.recipeId}`);
      }
    }
    expect(invalid, `Cooking quests referencing missing recipes: ${invalid.join(", ")}`).toEqual(
      [],
    );
  });
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */
});

// ─── No duplicate IDs ──────────────────────────────────────────────

describe("no duplicate IDs", () => {
  it("no duplicate item IDs", () => {
    const ids = recordKeys(trackerData.items);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("no duplicate NPC IDs", () => {
    const ids = recordKeys(trackerData.npcs);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("no duplicate recipe IDs", () => {
    const ids = recordKeys(trackerData.recipes);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("no duplicate cosmetic IDs", () => {
    const ids = recordKeys(trackerData.cosmetics);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("no duplicate quest IDs across quest types", () => {
    const allIds: string[] = [];
    for (const questType of recordValues(trackerData.quests)) {
      allIds.push(...recordKeys(questType));
    }
    const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
    expect(dupes, `Duplicate quest IDs: ${dupes.join(", ")}`).toEqual([]);
  });

  it("no duplicate almanac canonical IDs within a category", () => {
    for (const [catId, cat] of recordEntries(trackerData.almanac)) {
      const canonicalIds = cat.items.map((entry) => entry.itemIds[0]);
      const dupes = canonicalIds.filter((id, i) => canonicalIds.indexOf(id) !== i);
      expect(dupes, `Duplicate canonical IDs in almanac/${catId}: ${dupes.join(", ")}`).toEqual([]);
    }
  });

  it("no duplicate museum item IDs within a wing set", () => {
    for (const [wingId, wing] of recordEntries(trackerData.museum)) {
      for (const [setId, set] of recordEntries(wing.sets)) {
        const dupes = set.items.filter((id, i) => set.items.indexOf(id) !== i);
        expect(dupes, `Duplicate items in museum/${wingId}/${setId}: ${dupes.join(", ")}`).toEqual(
          [],
        );
      }
    }
  });
});

// ─── Town ranks ────────────────────────────────────────────────────

describe("town ranks", () => {
  it("ranks are in ascending order", () => {
    for (let i = 1; i < trackerData.townRanks.length; i++) {
      expect(trackerData.townRanks[i].levels.start).toBeGreaterThanOrEqual(
        trackerData.townRanks[i - 1].levels.end,
      );
    }
  });

  it("every rank has a name", () => {
    for (const rank of trackerData.townRanks) {
      expect(rank.name.length).toBeGreaterThan(0);
    }
  });

  it("first rank starts at 0 or 1", () => {
    expect(trackerData.townRanks[0].levels.start).toBeLessThanOrEqual(1);
  });
});

// ─── Animals ───────────────────────────────────────────────────────

describe("animals structural integrity", () => {
  it("every animal has at least one variant tier", () => {
    for (const [id, animal] of recordEntries(trackerData.animals)) {
      expect(animal.variantTiers.length, `${id} has no variant tiers`).toBeGreaterThan(0);
    }
  });

  it("every animal has a name", () => {
    for (const [id, animal] of recordEntries(trackerData.animals)) {
      expect(animal.name.length, `${id} has no name`).toBeGreaterThan(0);
    }
  });
});

// ─── Skills ────────────────────────────────────────────────────────

describe("skills structural integrity", () => {
  it("every skill has exactly 5 perk tiers", () => {
    for (const [id, skill] of recordEntries(trackerData.skills)) {
      expect(skill.perkTiers.length, `${id} has ${skill.perkTiers.length} perk tiers`).toBe(5);
    }
  });

  it("perkTierLevels has exactly 5 entries", () => {
    expect(trackerData.perkTierLevels.length).toBe(5);
  });

  it("perkTierLevels are in ascending order", () => {
    for (let i = 1; i < trackerData.perkTierLevels.length; i++) {
      expect(trackerData.perkTierLevels[i]).toBeGreaterThan(trackerData.perkTierLevels[i - 1]);
    }
  });
});

// ─── Mine biomes ───────────────────────────────────────────────────

describe("mine biomes structural integrity", () => {
  it("biome floors are in ascending order", () => {
    for (let i = 1; i < trackerData.mines.biomes.length; i++) {
      expect(trackerData.mines.biomes[i].floors.start).toBeGreaterThanOrEqual(
        trackerData.mines.biomes[i - 1].floors.end,
      );
    }
  });

  it("every biome has a name", () => {
    for (const biome of trackerData.mines.biomes) {
      expect(biome.name.length).toBeGreaterThan(0);
    }
  });

  it("every biome has start < end for floor range", () => {
    for (const biome of trackerData.mines.biomes) {
      expect(biome.floors.end).toBeGreaterThan(biome.floors.start);
    }
  });
});

// ─── Festivals ─────────────────────────────────────────────────────

describe("festivals structural integrity", () => {
  const validSeasons = ["spring", "summer", "fall", "winter"];

  it("every festival has a valid season", () => {
    for (const [id, festival] of recordEntries(trackerData.festivals)) {
      expect(validSeasons, `${id} has invalid season: ${festival.date.season}`).toContain(
        festival.date.season,
      );
    }
  });

  it("every festival has a day between 1 and 28", () => {
    for (const [id, festival] of recordEntries(trackerData.festivals)) {
      expect(
        festival.date.day,
        `${id} has invalid day: ${festival.date.day}`,
      ).toBeGreaterThanOrEqual(1);
      expect(festival.date.day, `${id} has invalid day: ${festival.date.day}`).toBeLessThanOrEqual(
        28,
      );
    }
  });
});

// ─── NPCs ──────────────────────────────────────────────────────────

describe("NPC structural integrity", () => {
  const validSeasons = ["spring", "summer", "fall", "winter"];

  it("every NPC has a birthday with valid season and day", () => {
    for (const [id, npc] of recordEntries(trackerData.npcs)) {
      expect(validSeasons, `${id} has invalid birthday season`).toContain(npc.birthday.season);
      expect(npc.birthday.day, `${id} birthday day`).toBeGreaterThanOrEqual(1);
      expect(npc.birthday.day, `${id} birthday day`).toBeLessThanOrEqual(28);
    }
  });

  it("every NPC has an English name in the generated locale chunk", () => {
    for (const id of recordKeys(trackerData.npcs)) {
      expect(getName("npcs", id, "en").length, `${id} has no name`).toBeGreaterThan(0);
    }
  });
});
