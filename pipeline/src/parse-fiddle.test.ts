import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseFiddle, sourceFileFor } from "./parse-fiddle.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("parseFiddle", () => {
  it("parses the complete v1.0.2 fixture with representative paths", () => {
    const parsed = parseFiddle("pipeline/input/assets");

    expect(parsed.fileCount).toBe(295);
    expect(parsed.data).toHaveProperty("items.other.cooked_dishes");
    expect(parsed.data).toHaveProperty("npcs.holt");
    expect(parsed.data).toHaveProperty("dungeons.dungeons.biomes");
    expect(parsed.sourceFileByRootPath.get("items.other.cooked_dishes")).toBe(
      "items/other/cooked_dishes.toml",
    );
    expect(sourceFileFor(parsed.data, "items.other.cooked_dishes.turnip_soup.value.bin")).toBe(
      "items/other/cooked_dishes.toml",
    );
  });

  it("reports the relative filename and dotted destination for malformed TOML", () => {
    const assetsDir = createAssetsFixture({ "items/broken.toml": "invalid = [" });

    expect(() => parseFiddle(assetsDir)).toThrowError(
      /items\/broken\.toml[\s\S]*items\.broken|items\.broken[\s\S]*items\/broken\.toml/,
    );
  });

  it("reports both destinations and the relative filename for duplicate destinations", () => {
    const assetsDir = createAssetsFixture({
      "items.toml": "enabled = true",
      "items/crops.toml": "enabled = true",
    });

    expect(() => parseFiddle(assetsDir)).toThrowError(
      /items\.toml[\s\S]*items[\s\S]*items\.crops|items\.crops[\s\S]*items[\s\S]*items\.toml/,
    );
  });

  it("reports both paths when a TOML file collides with a directory destination", () => {
    const assetsDir = createAssetsFixture({
      "npcs/holt.toml": 'name = "Holt"',
      "npcs/holt/profile.toml": 'birthday = "spring 1"',
    });

    expect(() => parseFiddle(assetsDir)).toThrowError(
      /npcs\/holt(?:\/profile)?\.toml[\s\S]*npcs\.holt(?:\.profile)?|npcs\.holt(?:\.profile)?[\s\S]*npcs\/holt(?:\/profile)?\.toml/,
    );
  });
});

function createAssetsFixture(files: Record<string, string>): string {
  const assetsDir = mkdtempSync(join(tmpdir(), "harvest-helper-parse-fiddle-"));
  temporaryDirectories.push(assetsDir);

  const fiddleDir = join(assetsDir, "fiddle");
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(fiddleDir, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return assetsDir;
}
