import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase, stubLocalizer } from "../test-helpers.js";
import { extractMines as extractLocalizedMines } from "./mines.js";

const localizer = stubLocalizer();

function extractMines(fiddle: ReturnType<typeof makeFiddleBase>, _localizer = localizer) {
  return extractLocalizedMines(fiddle, _localizer);
}

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({
    dungeons: { dungeons: { biomes: [] }, misc: { max_floors: 100 } },
    seals: {},
    ...overrides,
  });
}

describe("extractMines", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  it("lists seals in floor order, leaving out the one off the floors", () => {
    const { mines: result } = extractMines(
      makeFiddle({
        seals: {
          earth: { quest: "the_earth_tablet", stage: 1 },
          void: { quest: "creating_the_void_mass", stage: 0 },
          water: { quest: "the_water_tablet", stage: 1 },
        },
      }),
    );
    expect(result.seals).toEqual([
      { floor: 20, id: "water", questId: "the_water_tablet", stage: 1 },
      { floor: 40, id: "earth", questId: "the_earth_tablet", stage: 1 },
    ]);
  });

  it("throws on a seal with no known floor", () => {
    const seals = { new_seal: { quest: "a_quest", stage: 0 } };
    expect(() => extractMines(makeFiddle({ seals }))).toThrow("No mine floor recorded");
  });

  it.each([
    ["a stage", { water: { quest: "the_water_tablet" } }, "Expected numeric stage"],
    ["a quest", { water: { stage: 1 } }, "quest"],
  ])("throws on a seal without %s", (_name, seals, message) => {
    expect(() => extractMines(makeFiddle({ seals }))).toThrow(message);
  });

  it("throws without a seals table", () => {
    expect(() => extractMines(makeFiddle({ seals: undefined }))).toThrow("Missing seals table");
  });

  it("extracts biomes with floor ranges", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [
            { floor: 1, name: "Upper Mines" },
            { floor: 21, name: "The Tide Caverns" },
            { floor: 41, name: "Deep Earth" },
          ],
        },
        misc: { max_floors: 60 },
      },
    });

    const { mines: result } = extractMines(fiddle, localizer);

    expect(result.biomes).toEqual([
      { floors: { start: 1, end: 20 }, id: "upper_mines" },
      { floors: { start: 21, end: 40 }, id: "tide_caverns" },
      { floors: { start: 41, end: 60 }, id: "deep_earth" },
    ]);
  });

  it("lists each monster's spawn biomes, including a Sapling's spawned child", () => {
    const { mines } = extractMines(
      makeFiddle({
        dungeons: {
          dungeons: {
            biomes: [
              {
                floor: 1,
                name: "Upper Mines",
                votes: { enemy: [{ object: "mimic" }, { object: "sapling" }] },
              },
              {
                floor: 80,
                name: "Ancient Ruins",
                votes: {
                  enemy: [{ object: "mimic" }, { object: "mimic" }],
                  mini_boss_enemy: [{ object: "griffin_statue" }],
                },
              },
            ],
          },
          misc: { max_floors: 100 },
        },
        monsters: { sap: { sapling: { sap_children_species: "mini_sapling" } } },
      }),
    );
    expect(mines.monsters).toEqual({
      griffin_statue: { biomes: ["ancient_ruins"] },
      mimic: { biomes: ["upper_mines", "ancient_ruins"] },
      mini_sapling: { biomes: ["upper_mines"] },
      sapling: { biomes: ["upper_mines"] },
    });
  });

  it("generates descriptive biome IDs by stripping leading 'The', lowercasing, and replacing spaces", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [
            { floor: 1, name: "The Lava Caves" },
            { floor: 21, name: "Ancient Ruins" },
          ],
        },
        misc: { max_floors: 40 },
      },
    });

    const { mines: result } = extractMines(fiddle, localizer);
    expect(result.biomes[0].id).toBe("lava_caves");
    expect(result.biomes[1].id).toBe("ancient_ruins");
  });

  it("rejects a biome without a source floor", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [{ name: "First" }, { name: "Second" }],
        },
        misc: { max_floors: 50 },
      },
    });

    expect(() => extractMines(fiddle, localizer)).toThrow(
      "Expected numeric floor for dungeons.biomes[0] in dungeons.toml",
    );
  });

  it("rejects a biome without a source name", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: { biomes: [{ floor: 1 }] },
        misc: { max_floors: 20 },
      },
    });

    expect(() => extractMines(fiddle, localizer)).toThrow(
      "Expected nonempty string for dungeons.biomes[0].name in dungeons.toml",
    );
  });

  it("rejects a spell without a source name", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: { biomes: [{ floor: 1, name: "Upper Mines" }] },
        misc: { max_floors: 20 },
      },
      spells: { unnamed_spell: {} },
    });

    expect(() => extractMines(fiddle, localizer)).toThrow(
      "Expected nonempty string for spells.unnamed_spell.name in spells.toml",
    );
  });

  it("extracts spells from spells data", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: { biomes: [{ floor: 1, name: "Mines" }] },
        misc: { max_floors: 20 },
      },
      spells: {
        default: { name: "Default" },
        fireball: { name: "Fireball" },
        ice_lance: { name: "Ice Lance" },
      },
    });

    const { mines: result, spellLocaleNames } = extractMines(fiddle, localizer);
    expect(result.spells).toEqual({
      fireball: { sources: [] },
      ice_lance: { sources: [] },
    });
    expect(spellLocaleNames.ja["fireball" as never]).toBe("Fireball");
  });

  it("skips the default spell entry", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: { biomes: [{ floor: 1, name: "Mines" }] },
        misc: { max_floors: 20 },
      },
      spells: {
        default: { name: "Default Spell" },
        zap: { name: "Zap" },
      },
    });

    const { mines: result } = extractMines(fiddle, localizer);
    expect(result.spells).not.toHaveProperty("default");
    expect(result.spells).toHaveProperty("zap");
  });

  it("throws when max_floors is missing", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: { biomes: [] },
        misc: {},
      },
    });

    expect(() => extractMines(fiddle, localizer)).toThrow(
      "Missing numeric dungeons.misc.max_floors",
    );
  });

  it("returns empty spells when spells data is absent", () => {
    const fiddle = makeFiddle();
    const { mines: result } = extractMines(fiddle, localizer);
    expect(result.spells).toEqual({});
  });

  it("uses the biome name as fallback ID when name is a single word", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [{ floor: 1, name: "Abyss" }],
        },
        misc: { max_floors: 20 },
      },
    });

    const { mines: result } = extractMines(fiddle, localizer);
    expect(result.biomes[0].id).toBe("abyss");
  });
});
