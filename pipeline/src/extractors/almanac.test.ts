import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFiddle } from "../parse-fiddle";
import { extractAlmanac, readAlmanacCategories } from "./almanac";

import type { AlmanacCategoryId, AlmanacEntry } from "$lib/types/tracker-data.js";

const temporaryDirectories: string[] = [];

vi.mock("../localize", () => ({
  localizeField: vi.fn((_assetsDir: string, input: { englishValue: string; id: string }) => {
    const fallsBack = input.id === "turnip";
    return {
      fallbackLocales: fallsBack ? ["ja"] : [],
      values: {
        en: input.englishValue,
        es: input.englishValue,
        fr: input.englishValue,
        ja: fallsBack ? input.englishValue : `JA ${input.englishValue}`,
        ko: input.englishValue,
        ru: input.englishValue,
        "zh-Hans": input.englishValue,
        "zh-Hant": input.englishValue,
      },
    };
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("extractAlmanac", () => {
  it("traverses valid items while preserving item-level exclusions", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = createAssetsFixture({
      "fish.toml": `
[treasure]
is_chest = true
item = "chest_reward"
`,
      "items/other/crops.toml": `
[default]

[turnip]
name = "Turnip"
icon_sprite = "spr_ui_item_turnip"
tags = ["crop"]

[chest_reward]
name = "Chest Reward"
icon_sprite = "spr_ui_item_chest_reward"
tags = ["crop"]

[localized]
name = "items/names/localized"
icon_sprite = "spr_ui_item_localized"
tags = ["crop"]

[nameless]
icon_sprite = "spr_ui_item_nameless"
tags = ["crop"]
`,
      "items/other/unreviewed_new_items.toml": `
[internal_item]
name = "Internal Item"
tags = ["crop"]
`,
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "crops"
tags = ["crop"]
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    expect(extractAlmanac(fiddle, assetsDir)).toEqual({
      almanac: {
        crops: {
          items: [{ itemIds: ["turnip"] }],
        },
      },
      iconSpritesByItemId: {
        turnip: "spr_ui_item_turnip",
      },
      items: {
        turnip: { category: "crops" },
      },
      localeNames: {
        en: { turnip: "Turnip" },
        es: { turnip: "Turnip" },
        fr: { turnip: "Turnip" },
        ja: { turnip: "Turnip" },
        ko: { turnip: "Turnip" },
        ru: { turnip: "Turnip" },
        "zh-Hans": { turnip: "Turnip" },
        "zh-Hant": { turnip: "Turnip" },
      },
      localizationReport: {
        fallbackItemIds: {
          en: [],
          es: [],
          fr: [],
          ja: ["turnip"],
          ko: [],
          ru: [],
          "zh-Hans": [],
          "zh-Hant": [],
        },
        nonLocalizableItems: [
          "other/crops/localized (localization path: items/names/localized)",
          "other/crops/nameless (missing name)",
        ],
      },
    });
  });

  it("collapses colorways by recipe_key + name with alphabetical-first canonical ID", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = createAssetsFixture({
      "items/other/furniture.toml": `
[default]

[basic_chest_black]
name = "Basic Chest"
icon_sprite = "spr_ui_item_basic_chest_black"
tags = ["furniture"]
recipe_key = "basic_chest"

[basic_chest_dark]
name = "Basic Chest"
icon_sprite = "spr_ui_item_basic_chest_dark"
tags = ["furniture"]
recipe_key = "basic_chest"

[basic_chest_white]
name = "Basic Chest"
icon_sprite = "spr_ui_item_basic_chest_white"
tags = ["furniture"]
recipe_key = "basic_chest"
`,
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "furniture"
tags = ["furniture"]
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    const result = extractAlmanac(fiddle, assetsDir);
    const cat = result.almanac["furniture" as AlmanacCategoryId];
    const entry = cat.items[0];

    expect(entry.itemIds).toEqual(["basic_chest_black", "basic_chest_dark", "basic_chest_white"]);
    expect(entry.recipeId).toBe("basic_chest");
    expect(cat.items).toHaveLength(1);
  });

  it("keeps different names under the same recipe_key as separate entries", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = createAssetsFixture({
      "items/other/furniture.toml": `
[default]

[bed_single_v1]
name = "Bed"
icon_sprite = "spr_ui_item_bed_single"
tags = ["furniture"]
recipe_key = "bed"

[bed_double_v1]
name = "Double Bed"
icon_sprite = "spr_ui_item_bed_double"
tags = ["furniture"]
recipe_key = "bed"
`,
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "furniture"
tags = ["furniture"]
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    const result = extractAlmanac(fiddle, assetsDir);
    const cat = result.almanac["furniture" as AlmanacCategoryId];
    expect(cat.items).toHaveLength(2);
    const canonicalIds = cat.items.map((e: AlmanacEntry) => e.itemIds[0]).sort();
    expect(canonicalIds).toEqual(["bed_double_v1", "bed_single_v1"]);
  });

  it("includes items in every almanac category matched by their tags", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = createAssetsFixture({
      "items/other/materials.toml": `
[wood]
name = "Wood"
icon_sprite = "spr_ui_item_wood"
tags = ["material", "fishable"]

[shell]
name = "Shell"
icon_sprite = "spr_ui_item_shell"
tags = ["dive", "forageable", "material"]
`,
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "fish"
tags = ["fishable", "dive"]

[[categories]]
key = "forageables"
tags = ["forageable"]

[[categories]]
key = "materials"
tags = ["material"]
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    const result = extractAlmanac(fiddle, assetsDir);

    expect(result.almanac["fish" as AlmanacCategoryId].items).toEqual([
      { itemIds: ["shell"] },
      { itemIds: ["wood"] },
    ]);
    expect(result.almanac["forageables" as AlmanacCategoryId].items).toEqual([
      { itemIds: ["shell"] },
    ]);
    expect(result.almanac["materials" as AlmanacCategoryId].items).toEqual([
      { itemIds: ["shell"] },
      { itemIds: ["wood"] },
    ]);
    expect(result.items).toEqual({
      shell: { category: "forageables" },
      wood: { category: "materials" },
    });
    expect(result.iconSpritesByItemId).toEqual({
      shell: "spr_ui_item_shell",
      wood: "spr_ui_item_wood",
    });
  });

  it("singleton entries have a single-element itemIds array", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = createAssetsFixture({
      "items/other/crops.toml": `
[default]

[turnip]
name = "Turnip"
icon_sprite = "spr_ui_item_turnip"
tags = ["crop"]
`,
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "crops"
tags = ["crop"]
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    const result = extractAlmanac(fiddle, assetsDir);
    const entry = result.almanac["crops" as AlmanacCategoryId].items[0];
    expect(entry.itemIds).toEqual(["turnip"]);
    expect(entry.recipeId).toBeUndefined();
  });

  it("throws when an item is missing icon_sprite", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = createAssetsFixture({
      "items/other/crops.toml": `
[default]

[turnip]
name = "Turnip"
tags = ["crop"]
`,
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "crops"
tags = ["crop"]
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    expect(() => extractAlmanac(fiddle, assetsDir)).toThrow(
      'Missing icon_sprite for item "turnip"',
    );
  });
});

describe("readAlmanacCategories", () => {
  it("defaults the label key to the category key and honors local_key", () => {
    const assetsDir = createAssetsFixture({
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "crops"
tags = ["crop"]

[[categories]]
key = "fish"
tags = ["fishable", "dive"]
local_key = "misc_local/fishing_and_diving"
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    expect(readAlmanacCategories(fiddle)).toEqual([
      { key: "crops", localKey: "crops", tags: ["crop"] },
      { key: "fish", localKey: "fishing_and_diving", tags: ["fishable", "dive"] },
    ]);
  });

  it("throws on a local_key outside misc_local", () => {
    const assetsDir = createAssetsFixture({
      "ui/menus/sub_menus/almanac.toml": `
[[categories]]
key = "fish"
tags = ["fishable"]
local_key = "ui/fishing"
`,
    });
    const fiddle = parseFiddle(assetsDir).data;

    expect(() => readAlmanacCategories(fiddle)).toThrow(/expected "misc_local\/<key>"/);
  });
});

function createAssetsFixture(files: Record<string, string>): string {
  const assetsDir = mkdtempSync(join(tmpdir(), "mistria-fyi-almanac-"));
  temporaryDirectories.push(assetsDir);

  const fiddleDir = join(assetsDir, "fiddle");
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(fiddleDir, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return assetsDir;
}
