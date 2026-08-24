import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase } from "../test-helpers.js";
import { extractTreasureChestTiers } from "./treasure-chest-tiers.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ fishing: {}, items: {}, ...overrides });
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

  it("skips tiers without a matching treasure box item", () => {
    const fiddle = makeFiddle({
      fishing: {
        chest_tables: {
          abyss: { items: [] },
        },
      },
      items: {},
    });

    const tiers = extractTreasureChestTiers(fiddle);
    expect(Object.keys(tiers)).toEqual([]);
  });

  it("returns empty when no fishing data", () => {
    const fiddle = makeFiddle({ fishing: undefined });
    const tiers = extractTreasureChestTiers(fiddle);
    expect(Object.keys(tiers)).toEqual([]);
  });
});
