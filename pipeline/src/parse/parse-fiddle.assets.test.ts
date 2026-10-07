import { describe, expect, it } from "vitest";

import { requireGameAssetsDir } from "../test-helpers.js";
import { parseFiddle, sourceFileFor } from "./parse-fiddle.js";
import { checkParseSmoke } from "./parse-smoke.js";

describe("parseFiddle — v1.0.5 assets", () => {
  it("parses all files with representative paths", () => {
    const parsed = parseFiddle(requireGameAssetsDir());

    checkParseSmoke(parsed, "v1.0.5");

    expect(parsed.fileCount).toBe(297);
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
});
