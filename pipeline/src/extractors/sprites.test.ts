import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { extractSprites, extractVillagerSprites, publishSprites } from "./sprites.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

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
  it("extracts sprites as webp keyed by item ID under items/", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const result = await extractSprites(assetsDir, { turnip: "spr_ui_item_turnip" }, outputDir);

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.source).toBe("filesystem");

    const webpPath = join(outputDir, "items", "turnip.webp");
    expect(existsSync(webpPath)).toBe(false);

    publishSprites(result.staged);
    expect(existsSync(webpPath)).toBe(true);
    const webpData = readFileSync(webpPath);
    expect(webpData.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("stages one output file per item sharing a sprite, converting the source once", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Special");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_aldarian_artifact.png"), TINY_PNG);

    const result = await extractSprites(
      assetsDir,
      { artifact_a: "spr_ui_item_aldarian_artifact", artifact_b: "spr_ui_item_aldarian_artifact" },
      outputDir,
    );

    expect(result.extracted).toBe(2);
    expect(result.total).toBe(2);
    expect(result.staged).toHaveLength(2);

    publishSprites(result.staged);
    expect(existsSync(join(outputDir, "items", "artifact_a.webp"))).toBe(true);
    expect(existsSync(join(outputDir, "items", "artifact_b.webp"))).toBe(true);
  });

  it("finds sprites in fallback directories (Placeables, Player)", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const placeablesDir = join(assetsDir, "animations", "Placeables", "Furniture");
    mkdirSync(placeablesDir, { recursive: true });
    writeFileSync(join(placeablesDir, "spr_ui_item_furniture_arch.png"), TINY_PNG);

    const result = await extractSprites(
      assetsDir,
      { arch: "spr_ui_item_furniture_arch" },
      outputDir,
    );

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it("reports missing sprites", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const result = await extractSprites(
      assetsDir,
      { ghost: "spr_ui_item_ghost", turnip: "spr_ui_item_turnip" },
      outputDir,
    );

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual(["spr_ui_item_ghost"]);
    expect(result.total).toBe(2);

    // Conversions are staged in memory, not written — the caller must not publish on failure.
    expect(existsSync(join(outputDir, "items", "turnip.webp"))).toBe(false);
    expect(result.staged).toHaveLength(1);
  });

  it("skips sprites that already exist as webp", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const items = { turnip: "spr_ui_item_turnip" };

    const first = await extractSprites(assetsDir, items, outputDir);
    expect(first.extracted).toBe(1);
    expect(first.skipped).toBe(0);
    publishSprites(first.staged);

    const second = await extractSprites(assetsDir, items, outputDir);
    expect(second.extracted).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("skips outline PNGs and non-item-icon PNGs", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);
    writeFileSync(join(iconsDir, "spr_ui_item_turnip_outline.png"), TINY_PNG);
    writeFileSync(join(iconsDir, "some_other_sprite.png"), TINY_PNG);

    const result = await extractSprites(assetsDir, { turnip: "spr_ui_item_turnip" }, outputDir);

    expect(result.extracted).toBe(1);
    expect(result.total).toBe(1);
  });

  it("throws when no sprite source is available", async () => {
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    await expect(
      extractSprites(assetsDir, { turnip: "spr_ui_item_turnip" }, outputDir),
    ).rejects.toThrow("No sprite PNGs found in any search directory");
  });

  it("excludes overridden sprites from extraction", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_item_turnip.png"), TINY_PNG);

    const result = await extractSprites(
      assetsDir,
      { coin: "spr_mob_coin", turnip: "spr_ui_item_turnip" },
      outputDir,
    );

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.overridden).toBe(1);
    expect(result.total).toBe(1);
  });
});

describe("extractVillagerSprites", () => {
  it("extracts sprites as webp keyed by villager ID under villagers/", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "UI NEW", "Generic", "Icons", "NPC");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_generic_icon_npc_adeline.png"), TINY_PNG);

    const result = await extractVillagerSprites(
      assetsDir,
      { adeline: "spr_ui_generic_icon_npc_adeline" },
      outputDir,
    );

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.source).toBe("filesystem");

    const webpPath = join(outputDir, "villagers", "adeline.webp");
    expect(existsSync(webpPath)).toBe(false);

    publishSprites(result.staged);
    expect(existsSync(webpPath)).toBe(true);
    const webpData = readFileSync(webpPath);
    expect(webpData.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("reports missing villager sprites", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "UI NEW", "Generic", "Icons", "NPC");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_generic_icon_npc_adeline.png"), TINY_PNG);

    const result = await extractVillagerSprites(
      assetsDir,
      { adeline: "spr_ui_generic_icon_npc_adeline", ghost: "spr_ui_generic_icon_npc_ghost" },
      outputDir,
    );

    expect(result.extracted).toBe(1);
    expect(result.missing).toEqual(["spr_ui_generic_icon_npc_ghost"]);
    expect(result.total).toBe(2);
  });

  it("skips outline PNGs in the NPC icon directory", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "UI NEW", "Generic", "Icons", "NPC");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_generic_icon_npc_adeline.png"), TINY_PNG);
    writeFileSync(join(iconsDir, "spr_ui_generic_icon_npc_adeline_outline.png"), TINY_PNG);

    const result = await extractVillagerSprites(
      assetsDir,
      { adeline: "spr_ui_generic_icon_npc_adeline" },
      outputDir,
    );

    expect(result.extracted).toBe(1);
    expect(result.total).toBe(1);
  });

  it("does not extract villager sprites from the item icon search directories", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const assetsDir = makeTempDir();
    const outputDir = join(makeTempDir(), "sprites");

    const iconsDir = join(assetsDir, "animations", "Item Icons", "Crops");
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(join(iconsDir, "spr_ui_generic_icon_npc_adeline.png"), TINY_PNG);

    await expect(
      extractVillagerSprites(assetsDir, { adeline: "spr_ui_generic_icon_npc_adeline" }, outputDir),
    ).rejects.toThrow("No sprite PNGs found in any search directory");
  });
});
