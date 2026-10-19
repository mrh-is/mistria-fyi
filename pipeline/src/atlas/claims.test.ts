import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";

import { claimsFor, referencesInSource, scanPipelineReferences } from "./claims.js";

function createSourceFixture(files: Record<string, string>): string {
  const srcDir = mkdtempSync(join(tmpdir(), "mistria-fyi-atlas-src-"));
  onTestFinished(() => {
    rmSync(srcDir, { force: true, recursive: true });
  });
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(srcDir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return srcDir;
}

describe("referencesInSource", () => {
  it("finds member chains, fiddle arguments, dotted literals, & template prefixes", () => {
    const source = [
      'import { parseFiddle } from "./parse/parse-fiddle.js";',
      "const npcs = context.fiddle.npcs;",
      'const defaults = sourceFileFor(fiddle, "ui.skill_menu.defaults");',
      'const stations = nestedTableKeys(fiddle, "object_prototypes");',
      `const path = \`quests.\${type}\`;`,
    ].join("\n");

    expect(referencesInSource(source)).toEqual([
      "npcs",
      "object_prototypes",
      "quests",
      "ui.skill_menu.defaults",
    ]);
  });

  it("ignores comments, message text, & file names", () => {
    const source = [
      "// Reads every items/*.toml file",
      "/** `cutscenes.toml` gives this item. */",
      'const message = "Expected fiddle.items to be a table";',
      'const file = "player_assets.toml";',
      'const url = "https://example.com/a.b";',
      "const tools = fiddle.items.tools;",
      "/** Trailing doc comment. */",
      "const npcs = fiddle.npcs;",
    ].join("\n");

    expect(referencesInSource(source)).toEqual(["items.tools", "npcs"]);
  });

  it("follows optional & bracketed access to the outermost known path", () => {
    const source = [
      'const max = fiddle.dungeons?.misc["max_floors"];',
      "const entry = fiddle.quests[id];",
    ].join("\n");

    expect(referencesInSource(source)).toEqual(["dungeons.misc.max_floors", "quests"]);
  });
});

describe("claimsFor", () => {
  it("marks paths at or inside a root, and ancestors of it", () => {
    const references = [
      { module: "extract/items.ts", reference: "items" },
      { module: "extract/npcs.ts", reference: "npcs.holt" },
      { module: "extract/recipes.ts", reference: "items.other.cooked_dishes.soup.recipe" },
      { module: "extract/unrelated.ts", reference: "items_extra" },
    ];

    expect(claimsFor("items.other.cooked_dishes", references)).toEqual([
      { module: "extract/items.ts", reference: "items", via: "ancestor" },
      {
        module: "extract/recipes.ts",
        reference: "items.other.cooked_dishes.soup.recipe",
        via: "path",
      },
    ]);
    expect(claimsFor("npcs.holt", references)).toEqual([
      { module: "extract/npcs.ts", reference: "npcs.holt", via: "path" },
    ]);
  });

  it("keeps an ancestor claim beside a module's narrower paths", () => {
    // Like extract/mines.ts: it holds `fiddle.dungeons`, names the biomes, and reads `misc`
    // through a local variable the scan can't follow.
    const references = [
      { module: "extract/mines.ts", reference: "dungeons" },
      { module: "extract/mines.ts", reference: "dungeons.dungeons.biomes" },
    ];

    expect(claimsFor("dungeons.misc", references)).toEqual([
      { module: "extract/mines.ts", reference: "dungeons", via: "ancestor" },
    ]);
    expect(claimsFor("dungeons.dungeons", references)).toEqual([
      { module: "extract/mines.ts", reference: "dungeons", via: "ancestor" },
      { module: "extract/mines.ts", reference: "dungeons.dungeons.biomes", via: "path" },
    ]);
  });
});

describe("scanPipelineReferences", () => {
  it("scans non-test modules only", () => {
    const srcDir = createSourceFixture({
      "assets-test-setup.ts": "fiddle.setup",
      "atlas/inventory.ts": "fiddle.atlas",
      "extract/npcs.test.ts": "fiddle.tested",
      "extract/npcs.ts": "const npcs = fiddle.npcs;",
      "test-helpers.ts": "fiddle.helper",
    });

    expect(scanPipelineReferences(srcDir)).toEqual([
      { module: "extract/npcs.ts", reference: "npcs" },
    ]);
  });

  it("finds the pipeline's own claim on a known root", () => {
    const pipelineSrc = fileURLToPath(new URL("..", import.meta.url));
    const references = scanPipelineReferences(pipelineSrc);

    expect(claimsFor("renown", references)).toContainEqual({
      module: "extract/renown.ts",
      reference: "renown",
      via: "path",
    });
  });
});
