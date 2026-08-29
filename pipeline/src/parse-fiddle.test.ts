import { afterEach, describe, expect, it } from "vitest";

import { parseFiddle, sourceFileFor } from "./parse-fiddle.js";
import { createAssetsFixture, removeAssetsFixtures } from "./test-helpers.js";

afterEach(() => {
  removeAssetsFixtures();
});

describe("parseFiddle", () => {
  it("assembles nested TOML files and records source provenance", () => {
    const assetsDir = createAssetsFixture({
      "items/other/cooked_dishes.meta.toml": "ignored = true",
      "items/other/cooked_dishes.toml":
        'turnip_soup = { name = "Turnip Soup", value = { bin = 100 } }',
      "npcs/holt.toml": 'name = "Holt"',
    });

    const parsed = parseFiddle(assetsDir);

    expect(parsed.fileCount).toBe(2);
    expect(parsed.data).toHaveProperty("items.other.cooked_dishes.turnip_soup");
    expect(parsed.data).toHaveProperty("npcs.holt.name", "Holt");
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
      /items\.toml[\s\S]*items[\s\S]*items\.crops|items\.crops[\s\S]*items[\s\S]*items\.toml/,
    );
  });

  it("reports both paths when a TOML file collides with a directory destination", () => {
    const assetsDir = createAssetsFixture({
      "npcs/holt.toml": 'name = "Holt"',
      "npcs/holt/profile.toml": 'birthday = "spring 1"',
    });

    expect(() => parseFiddle(assetsDir)).toThrow(
      /npcs\/holt(?:\/profile)?\.toml[\s\S]*npcs\.holt(?:\.profile)?|npcs\.holt(?:\.profile)?[\s\S]*npcs\/holt(?:\/profile)?\.toml/,
    );
  });
});
