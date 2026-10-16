import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { createAssetsFixture } from "../test-helpers.js";
import { buildAtlas, extensionOf, shapeOf, topFolder } from "./inventory.js";

function writeAssetFiles(assetsDir: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(assetsDir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

describe("shapeOf", () => {
  it("names primitive types", () => {
    expect(shapeOf("soup")).toBe("string");
    expect(shapeOf(3)).toBe("number");
    expect(shapeOf(true)).toBe("boolean");
    expect(shapeOf(new Date(0))).toBe("datetime");
  });

  it("lists the union of array element shapes", () => {
    expect(shapeOf([])).toBe("array");
    expect(shapeOf(["a", 1, "b"])).toBe("array<number | string>");
  });

  it("merges array tables, marking fields some elements lack", () => {
    expect(shapeOf([{ item: "egg" }, { count: 2, item: "milk" }])).toBe(
      "array<{count?: number, item: string}>",
    );
  });

  it("collapses a large table of tables to an ID-keyed map", () => {
    const entries = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`id_${index}`, { value: index }]),
    );

    expect(shapeOf(entries)).toBe("map<{value: number}>");
    expect(shapeOf({ a: { value: 1 } })).toBe("{a: {value: number}}");
  });

  it("stops spelling out tables at the depth limit", () => {
    expect(shapeOf({ outer: { inner: { leaf: 1 } } })).toBe("{outer: {inner: table}}");
  });
});

describe("path helpers", () => {
  it("keeps .meta.toml distinct and names extensionless files", () => {
    expect(extensionOf("fiddle.meta.toml")).toBe(".meta.toml");
    expect(extensionOf("rm_town.TMX")).toBe(".tmx");
    expect(extensionOf(".gitignore")).toBe("(none)");
  });

  it("finds the top-level folder of a nested path", () => {
    expect(topFolder("tiled/rooms/Town/rm_town.tmx")).toBe("tiled");
    expect(topFolder("loose.txt")).toBe(".");
  });
});

describe("buildAtlas", () => {
  it("inventories folders & fiddle roots, excluding .meta.toml from roots", () => {
    const assetsDir = createAssetsFixture({
      "fiddle.meta.toml": 'asset_kind = "Fiddle"',
      "items/other/dishes.toml": [
        'soup = { name = "Soup", tags = ["food"] }',
        'stew = { name = "Stew", restore = "dish" }',
      ].join("\n"),
      "npcs/holt.toml": 'name = "Holt"\nbirthday = { season = "spring", day = 4 }',
    });
    writeAssetFiles(assetsDir, {
      ".DS_Store": "",
      "gml/objects/obj_bird.gml": "",
      "localization/translations/fra.meta.toml": "",
      "tiled/.gitignore": "",
    });

    const atlas = buildAtlas(assetsDir, "9.9.9", [
      { module: "extract/villagers.ts", reference: "npcs" },
    ]);

    expect(atlas.version).toBe("9.9.9");
    expect(
      atlas.folders.map(({ extensions, files, name }) => ({ extensions, files, name })),
    ).toEqual([
      {
        extensions: { ".meta.toml": 1, ".toml": 2 },
        files: [
          "fiddle/fiddle.meta.toml",
          "fiddle/items/other/dishes.toml",
          "fiddle/npcs/holt.toml",
        ],
        name: "fiddle",
      },
      { extensions: { ".gml": 1 }, files: ["gml/objects/obj_bird.gml"], name: "gml" },
      {
        extensions: { ".meta.toml": 1 },
        files: ["localization/translations/fra.meta.toml"],
        name: "localization",
      },
      { extensions: { "(none)": 1 }, files: ["tiled/.gitignore"], name: "tiled" },
    ]);
    expect(atlas.fiddle).toEqual([
      {
        claims: [],
        keys: {
          soup: "{name: string, tags: array<string>}",
          stew: "{name: string, restore: string}",
        },
        rootPath: "items.other.dishes",
        sourceFile: "items/other/dishes.toml",
      },
      {
        claims: [{ module: "extract/villagers.ts", reference: "npcs" }],
        keys: { birthday: "{day: number, season: string}", name: "string" },
        rootPath: "npcs.holt",
        sourceFile: "npcs/holt.toml",
      },
    ]);
  });
});
