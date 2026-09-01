import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFiddle } from "../parse-fiddle.js";
import { extractAlmanac } from "./almanac.js";

import type { AlmanacCategoryId, AlmanacEntry } from "$lib/types/tracker-data.js";

const temporaryDirectories: string[] = [];

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
tags = ["crop"]

[chest_reward]
name = "Chest Reward"
tags = ["crop"]

[localized]
name = "items/names/localized"
tags = ["crop"]

[nameless]
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

    expect(extractAlmanac(fiddle, new Map())).toEqual({
      almanac: {
        crops: {
          items: [{ itemIds: ["turnip"], name: "Turnip" }],
          name: "Crops",
        },
      },
      items: {
        turnip: { category: "crops", name: "Turnip" },
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
tags = ["furniture"]
recipe_key = "basic_chest"

[basic_chest_dark]
name = "Basic Chest"
tags = ["furniture"]
recipe_key = "basic_chest"

[basic_chest_white]
name = "Basic Chest"
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

    const result = extractAlmanac(fiddle, new Map());
    const cat = result.almanac["furniture" as AlmanacCategoryId];
    const entry = cat.items[0];

    expect(entry.name).toBe("Basic Chest");
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
tags = ["furniture"]
recipe_key = "bed"

[bed_double_v1]
name = "Double Bed"
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

    const result = extractAlmanac(fiddle, new Map());
    const cat = result.almanac["furniture" as AlmanacCategoryId];
    expect(cat.items).toHaveLength(2);
    const names = cat.items.map((e: AlmanacEntry) => e.name).sort();
    expect(names).toEqual(["Bed", "Double Bed"]);
  });

  it("includes items in every almanac category matched by their tags", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = createAssetsFixture({
      "items/other/materials.toml": `
[wood]
name = "Wood"
tags = ["material", "fishable"]

[shell]
name = "Shell"
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

    const result = extractAlmanac(fiddle, new Map());

    expect(result.almanac["fish" as AlmanacCategoryId].items).toEqual([
      { itemIds: ["shell"], name: "Shell" },
      { itemIds: ["wood"], name: "Wood" },
    ]);
    expect(result.almanac["forageables" as AlmanacCategoryId].items).toEqual([
      { itemIds: ["shell"], name: "Shell" },
    ]);
    expect(result.almanac["materials" as AlmanacCategoryId].items).toEqual([
      { itemIds: ["shell"], name: "Shell" },
      { itemIds: ["wood"], name: "Wood" },
    ]);
    expect(result.items).toEqual({
      shell: { category: "forageables", name: "Shell" },
      wood: { category: "materials", name: "Wood" },
    });
  });

  it("singleton entries have a single-element itemIds array", () => {
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

    const result = extractAlmanac(fiddle, new Map());
    const entry = result.almanac["crops" as AlmanacCategoryId].items[0];
    expect(entry.itemIds).toEqual(["turnip"]);
    expect(entry.recipeId).toBeUndefined();
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
