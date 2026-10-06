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
    ...overrides,
  });
}

describe("extractMines", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
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

  it("uses fallback floor values when biomes omit floor field", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [{ name: "First" }, { name: "Second" }],
        },
        misc: { max_floors: 50 },
      },
    });

    const { mines: result } = extractMines(fiddle, localizer);
    expect(result.biomes[0].floors).toEqual({ start: 1, end: 20 });
    expect(result.biomes[1].floors).toEqual({ start: 21, end: 50 });
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
