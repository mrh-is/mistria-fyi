import { describe, expect, it } from "vitest";

import { createAssetsFixture, writeStoredZipFixture } from "../test-helpers.js";
import { parseFiddle, parseFiddleFromZip, sourceFileFor } from "./parse-fiddle.js";

describe("parseFiddle", () => {
  it("assembles nested TOML files and records source provenance", () => {
    const assetsDir = createAssetsFixture({
      "items/other/cooked_dishes.meta.toml": "ignored = true",
      "items/other/cooked_dishes.toml":
        'turnip_soup = { name = "Turnip Soup", value = { bin = 100 } }',
      "villagers/holt.toml": 'name = "Holt"',
    });

    const parsed = parseFiddle(assetsDir);

    expect(parsed.fileCount).toBe(2);
    expect(parsed.data).toHaveProperty("items.other.cooked_dishes.turnip_soup");
    expect(parsed.data).toHaveProperty("villagers.holt.name", "Holt");
    expect(parsed.sourceFileByRootPath.get("items.other.cooked_dishes")).toBe(
      "items/other/cooked_dishes.toml",
    );
    expect(sourceFileFor(parsed.data, "items.other.cooked_dishes.turnip_soup.value.bin")).toBe(
      "items/other/cooked_dishes.toml",
    );
  });

  it("reports the relative filename and dotted destination for malformed TOML", () => {
    const assetsDir = createAssetsFixture({ "items/broken.toml": "invalid = [" });

    expect(() => parseFiddle(assetsDir)).toThrow(
      /items\/broken\.toml[\s\S]*items\.broken|items\.broken[\s\S]*items\/broken\.toml/,
    );
  });

  it("reports both destinations and the relative filename for duplicate destinations", () => {
    const assetsDir = createAssetsFixture({
      "items.toml": "enabled = true",
      "items/crops.toml": "enabled = true",
    });

    expect(() => parseFiddle(assetsDir)).toThrow(
      /"items"[\s\S]*"items\.crops"[\s\S]*items\.toml[\s\S]*items\/crops\.toml/,
    );
  });

  it("reports both paths when a TOML file collides with a directory destination", () => {
    const assetsDir = createAssetsFixture({
      "villagers/holt.toml": 'name = "Holt"',
      "villagers/holt/profile.toml": 'birthday = "spring 1"',
    });

    expect(() => parseFiddle(assetsDir)).toThrow(
      /villagers\/holt(?:\/profile)?\.toml[\s\S]*villagers\.holt(?:\.profile)?|villagers\.holt(?:\.profile)?[\s\S]*villagers\/holt(?:\/profile)?\.toml/,
    );
  });
});

describe("parseFiddleFromZip", () => {
  it("registers disk and shuffled zip inputs in the same stable order", async () => {
    const files = Object.fromEntries([
      ["zebra.toml", "value = 1"],
      ["alpha/zebra.toml", "value = 2"],
      ["alpha/ant.toml", "value = 3"],
    ]);
    const disk = parseFiddle(createAssetsFixture(files));
    const zip = await parseFiddleFromZip(
      writeStoredZipFixture(
        Object.fromEntries(
          Object.entries(files).map(([path, text]) => [`assets/fiddle/${path}`, text]),
        ),
      ),
    );
    expect([...zip.sourceFileByRootPath.keys()]).toEqual(["alpha.ant", "alpha.zebra", "zebra"]);
    expect(JSON.stringify(zip.data)).toBe(JSON.stringify(disk.data));
  });

  it("reads fiddle/ TOML entries straight out of the zip, producing the same shape as parseFiddle", async () => {
    const zipPath = writeStoredZipFixture({
      "assets/animations/UI NEW/Generic/Icons/NPC/spr_ui_generic_icon_npc_adeline.png": "binary",
      "assets/fiddle/": "",
      "assets/fiddle/items/other/cooked_dishes.meta.toml": "ignored = true",
      "assets/fiddle/items/other/cooked_dishes.toml":
        'turnip_soup = { name = "Turnip Soup", value = { bin = 100 } }',
      "assets/fiddle/villagers/holt.toml": 'name = "Holt"',
    });

    const parsed = await parseFiddleFromZip(zipPath);

    expect(parsed.fileCount).toBe(2);
    expect(parsed.data).toHaveProperty("items.other.cooked_dishes.turnip_soup");
    expect(parsed.data).toHaveProperty("villagers.holt.name", "Holt");
    expect(parsed.sourceFileByRootPath.get("items.other.cooked_dishes")).toBe(
      "items/other/cooked_dishes.toml",
    );
    expect(sourceFileFor(parsed.data, "items.other.cooked_dishes.turnip_soup.value.bin")).toBe(
      "items/other/cooked_dishes.toml",
    );
  });

  it("accepts a paths filter to parse only matching TOML entries", async () => {
    const zipPath = writeStoredZipFixture({
      "assets/fiddle/items/other/cooked_dishes.toml":
        'turnip_soup = { name = "Turnip Soup", value = { bin = 100 } }',
      "assets/fiddle/npcs/holt.toml": 'name = "Holt"',
      "assets/fiddle/npcskins/holt.toml": "invalid = [",
    });

    const parsed = await parseFiddleFromZip(zipPath, ["npcs"]);

    expect(parsed.fileCount).toBe(1);
    expect(parsed.data).toHaveProperty("npcs.holt.name", "Holt");
    expect(parsed.data).not.toHaveProperty("items.other.cooked_dishes.turnip_soup");
    expect(parsed.data).not.toHaveProperty("npcskins.holt");
  });

  it("reports both destinations for duplicate destinations", async () => {
    const zipPath = writeStoredZipFixture({
      "assets/fiddle/items.toml": "enabled = true",
      "assets/fiddle/items/crops.toml": "enabled = true",
    });

    // Object key order (and so zip entry order) isn't guaranteed to survive formatting, so assert
    // on content rather than which of the two colliding paths the error happened to be raised from.
    let thrownError: unknown;
    try {
      await parseFiddleFromZip(zipPath);
    } catch (error) {
      thrownError = error;
    }
    expect(thrownError).toBeInstanceOf(Error);
    const message = (thrownError as Error).message;
    expect(message).toContain("Duplicate or colliding TOML destinations");
    expect(message).toContain('"items"');
    expect(message).toContain('"items.crops"');
  });

  it("reports the relative filename and dotted destination for malformed TOML", async () => {
    const zipPath = writeStoredZipFixture({ "assets/fiddle/items/broken.toml": "invalid = [" });

    await expect(parseFiddleFromZip(zipPath)).rejects.toThrow(
      /items\/broken\.toml[\s\S]*items\.broken|items\.broken[\s\S]*items\/broken\.toml/,
    );
  });
});
