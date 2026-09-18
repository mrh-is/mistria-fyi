import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { extractSprites } from "./sprites";

import type { Item, ItemId } from "$lib/types/tracker-data.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function makeItems(entries: Record<string, string>): Record<ItemId, Item> {
  return Object.fromEntries(
    Object.entries(entries).map(([id, iconSprite]) => [
      id,
      { category: "crops", iconSprite, name: id, sources: [{ type: "default" }] },
    ]),
  );
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mistria-fyi-sprites-"));
  temporaryDirectories.push(dir);
  return dir;
}

// Minimal valid 1x1 RGBA PNG (sharp needs a real PNG to convert)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

describe("extractSprites", () => {
  it("extracts sprites as webp from Item Icons directory", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const items = makeItems({ turnip: "spr_ui_item_turnip" });
    const result = await extractSprites(assetsDir, items, outputDir);

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.source).toBe("filesystem");

    const webpPath = join(outputDir, "spr_ui_item_turnip.webp");
    expect(existsSync(webpPath)).toBe(true);
    const webpData = readFileSync(webpPath);
    expect(webpData.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("finds sprites in fallback directories (Placeables, Player)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const placeablesDir = join(assetsDir, "animations", "Placeables", "Furniture");
    mkdirSync(placeablesDir, { recursive: true });
    writeFileSync(join(placeablesDir, "spr_ui_item_furniture_arch.png"), TINY_PNG);

    const items = makeItems({ arch: "spr_ui_item_furniture_arch" });
    const result = await extractSprites(assetsDir, items, outputDir);

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it("reports missing sprites", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const items = makeItems({
      ghost: "spr_ui_item_ghost",
      turnip: "spr_ui_item_turnip",
    });
    const result = await extractSprites(assetsDir, items, outputDir);

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual(["spr_ui_item_ghost"]);
    expect(result.total).toBe(2);
  });

  it("skips sprites that already exist as webp", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const items = makeItems({ turnip: "spr_ui_item_turnip" });

    const first = await extractSprites(assetsDir, items, outputDir);
    expect(first.extracted).toBe(1);
    expect(first.skipped).toBe(0);

    const second = await extractSprites(assetsDir, items, outputDir);
    expect(second.extracted).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("skips outline PNGs and non-item-icon PNGs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);
    writeFileSync(join(iconsDir, "spr_ui_item_turnip_outline.png"), TINY_PNG);
    writeFileSync(join(iconsDir, "some_other_sprite.png"), TINY_PNG);

    const items = makeItems({ turnip: "spr_ui_item_turnip" });
    const result = await extractSprites(assetsDir, items, outputDir);

    expect(result.extracted).toBe(1);
    expect(result.total).toBe(1);
  });

  it("throws when no sprite source is available", async () => {
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const items = makeItems({ turnip: "spr_ui_item_turnip" });
    await expect(extractSprites(assetsDir, items, outputDir)).rejects.toThrow(
      "No sprite PNGs found in any search directory",
    );
  });

  it("excludes overridden sprites from extraction", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const items = makeItems({
      coin: "spr_mob_coin",
      turnip: "spr_ui_item_turnip",
    });
    const result = await extractSprites(assetsDir, items, outputDir);

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.overridden).toBe(1);
    expect(result.total).toBe(1);
  });
});
