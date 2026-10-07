import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase, stubLocalizer } from "../test-helpers.js";
import { extractTreasureChestTiers } from "./treasure-chest-tiers.js";

const localizer = stubLocalizer((input, locale) =>
  locale === "ja" ? `JA ${input.englishValue}` : undefined,
);

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ fishing: {}, items: {}, ...overrides });
}

describe("extractTreasureChestTiers", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps chest_tables keys to localized tier names", () => {
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

    const { localeNames, tiers } = extractTreasureChestTiers(fiddle, localizer);
    expect(tiers).toEqual({
      copper: {},
      gold: {},
      wood: {},
    });
    expect(localeNames.ja["gold" as never]).toBe("JA Golden Treasure Box");
  });

  it("names the abyss tier after the Abyssal Chest item", () => {
    const fiddle = makeFiddle({
      fishing: { chest_tables: { abyss: { items: [] } } },
      items: { other: { misc: { abyssal_chest: { name: "Abyssal Chest" } } } },
    });

    const { localeNames, tiers } = extractTreasureChestTiers(fiddle, localizer);
    expect(tiers).toEqual({ abyss: {} });
    expect(localeNames.ja["abyss" as never]).toBe("JA Abyssal Chest");
  });

  it("throws for a tier without a matching item", () => {
    const fiddle = makeFiddle({
      fishing: { chest_tables: { platinum: { items: [] } } },
      items: {},
    });

    expect(() => extractTreasureChestTiers(fiddle, localizer)).toThrow(
      'Chest tier "platinum" has no item "fish/misc/treasure_box_platinum"',
    );
  });

  it("throws for a tier whose item name isn't a string", () => {
    const fiddle = makeFiddle({
      fishing: { chest_tables: { gold: { items: [] } } },
      items: { fish: { misc: { treasure_box_gold: { name: { en: "Golden" } } } } },
    });

    expect(() => extractTreasureChestTiers(fiddle, localizer)).toThrow(
      'Chest tier "gold" has no item "fish/misc/treasure_box_gold"',
    );
  });

  it("returns empty when no fishing data", () => {
    const fiddle = makeFiddle({ fishing: undefined });
    const { tiers } = extractTreasureChestTiers(fiddle, localizer);
    expect(Object.keys(tiers)).toEqual([]);
  });
});
