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

  it("ignores paths cited only in comments", () => {
    const source = [
      "// `cutscenes.toml` gives this item",
      "/** Reads `letters.toml` entries. */",
      'const url = "https://example.com/a.b";',
    ].join("\n");

    expect(referencesInSource(source)).toEqual([]);
  });
});

describe("claimsFor", () => {
  it("matches a root by an exact, ancestor, or descendant reference", () => {
    const references = [
      { module: "extract/items.ts", reference: "items" },
      { module: "extract/npcs.ts", reference: "npcs.holt" },
      { module: "extract/recipes.ts", reference: "items.other.cooked_dishes.soup.recipe" },
      { module: "extract/unrelated.ts", reference: "items_extra" },
    ];

    expect(claimsFor("items.other.cooked_dishes", references)).toEqual([
      { module: "extract/items.ts", reference: "items" },
      { module: "extract/recipes.ts", reference: "items.other.cooked_dishes.soup.recipe" },
    ]);
    expect(claimsFor("npcs.holt", references)).toEqual([
      { module: "extract/npcs.ts", reference: "npcs.holt" },
    ]);
  });

  it("drops a module's ancestor reference when it also names a narrower path", () => {
    const references = [
      { module: "extract/skills.ts", reference: "ui" },
      { module: "extract/skills.ts", reference: "ui.skill_menu.defaults" },
    ];

    expect(claimsFor("ui.credits", references)).toEqual([]);
    expect(claimsFor("ui.skill_menu.defaults", references)).toEqual([
      { module: "extract/skills.ts", reference: "ui.skill_menu.defaults" },
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
    });
  });
});
