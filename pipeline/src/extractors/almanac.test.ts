import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFiddle } from "../parse-fiddle.js";
import { extractAlmanac } from "./almanac.js";

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

    expect(extractAlmanac(fiddle)).toEqual({
      almanac: {
        crops: {
          items: ["turnip"],
          name: "Crops",
        },
      },
      items: {
        turnip: { category: "crops", name: "Turnip" },
      },
    });
  });
});

function createAssetsFixture(files: Record<string, string>): string {
  const assetsDir = mkdtempSync(join(tmpdir(), "harvest-helper-almanac-"));
  temporaryDirectories.push(assetsDir);

  const fiddleDir = join(assetsDir, "fiddle");
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(fiddleDir, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return assetsDir;
}
