import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase } from "../test-helpers.js";
import { extractTreasureChestTiers } from "./treasure-chest-tiers.js";

vi.mock("../localize.js", () => ({
  localizeField: vi.fn((_assetsDir: string, input: { englishValue: string }) => ({
    fallbackLocales: [],
    values: Object.fromEntries(
      ["en", "es", "fr", "ja", "ko", "ru", "zh-Hans", "zh-Hant"].map((locale) => [
        locale,
        locale === "ja" ? `JA ${input.englishValue}` : input.englishValue,
      ]),
    ),
  })),
}));

const assetsDir = "test-assets";

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

    const { localeNames, tiers } = extractTreasureChestTiers(fiddle, assetsDir);
    expect(tiers).toEqual({
      copper: {},
      gold: {},
      wood: {},
    });
    expect(localeNames.ja["gold" as never]).toBe("JA Golden Treasure Box");
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

    const { tiers } = extractTreasureChestTiers(fiddle, assetsDir);
    expect(Object.keys(tiers)).toEqual([]);
  });

  it("returns empty when no fishing data", () => {
    const fiddle = makeFiddle({ fishing: undefined });
    const { tiers } = extractTreasureChestTiers(fiddle, assetsDir);
    expect(Object.keys(tiers)).toEqual([]);
  });
});
