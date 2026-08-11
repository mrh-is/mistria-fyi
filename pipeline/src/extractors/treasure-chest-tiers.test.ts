import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractTreasureChestTiers } from "./treasure-chest-tiers.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    fishing: {},
    items: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("extractTreasureChestTiers", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps chest_tables keys to treasure box item names", () => {
    const fiddle = makeFiddle({
      fishing: {
        chest_tables: {
          copper: { items: [] },
          gold: { items: [] },
          wood: { items: [] },
        },
      },
      items: {
        fish: {
          misc: {
            default: {},
            treasure_box_copper: { name: "Copper Treasure Box" },
            treasure_box_gold: { name: "Golden Treasure Box" },
            treasure_box_wood: { name: "Wooden Treasure Box" },
          },
        },
      },
    });

    const tiers = extractTreasureChestTiers(fiddle);
    expect(tiers).toEqual({
      copper: { name: "Copper Treasure Box" },
      gold: { name: "Golden Treasure Box" },
      wood: { name: "Wooden Treasure Box" },
    });
  });

  it("throws when treasure box item not found for tier", () => {
    const fiddle = makeFiddle({
      fishing: {
        chest_tables: {
          abyss: { items: [] },
        },
      },
      items: {},
    });

    expect(() => extractTreasureChestTiers(fiddle)).toThrow(
      'Treasure chest tier "abyss" has no matching item "treasure_box_abyss"',
    );
  });

  it("returns empty when no fishing data", () => {
    const fiddle = makeFiddle({ fishing: undefined });
    const tiers = extractTreasureChestTiers(fiddle);
    expect(Object.keys(tiers)).toEqual([]);
  });
});
