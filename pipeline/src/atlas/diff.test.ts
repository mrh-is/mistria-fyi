import { describe, expect, it } from "vitest";

import { diffAtlases } from "./diff.js";
import { renderDiff, shapeDelta } from "./render.js";

import type { AssetAtlas, FiddleFileInventory } from "./inventory.js";

function fiddleFile(rootPath: string, keys: Record<string, string>): FiddleFileInventory {
  return { claims: [], keys, rootPath, sourceFile: `${rootPath}.toml` };
}

function atlas(version: string, files: string[], fiddle: FiddleFileInventory[]): AssetAtlas {
  return { fiddle, folders: [{ extensions: {}, files, name: "fiddle" }], version };
}

const before = atlas(
  "1.0.0",
  ["fiddle/kept.toml", "fiddle/gone.toml"],
  [
    fiddleFile("kept", { dropped: "string", same: "number", widened: "{name: string}" }),
    fiddleFile("gone", { a: "string" }),
    fiddleFile("steady", { a: "string" }),
  ],
);
const after = atlas(
  "1.1.0",
  ["fiddle/kept.toml", "fiddle/new.toml"],
  [
    fiddleFile("kept", {
      fresh: "boolean",
      same: "number",
      widened: "{gold: boolean, name: string}",
    }),
    fiddleFile("new", { a: "string" }),
    fiddleFile("steady", { a: "string" }),
  ],
);

describe("diffAtlases", () => {
  it("reports added & removed files, roots, & keys, and reshaped keys", () => {
    expect(diffAtlases(before, after)).toEqual({
      after: "1.1.0",
      before: "1.0.0",
      fiddle: {
        added: ["new"],
        changed: [
          {
            addedKeys: ["fresh"],
            removedKeys: ["dropped"],
            reshapedKeys: [
              { after: "{gold: boolean, name: string}", before: "{name: string}", key: "widened" },
            ],
            rootPath: "kept",
          },
        ],
        removed: ["gone"],
      },
      files: { added: ["fiddle/new.toml"], removed: ["fiddle/gone.toml"] },
    });
  });

  it("reports nothing between identical atlases", () => {
    const diff = diffAtlases(after, after);

    expect(diff.files).toEqual({ added: [], removed: [] });
    expect(diff.fiddle).toEqual({ added: [], changed: [], removed: [] });
  });
});

describe("renderDiff", () => {
  it("summarizes each kind of change", () => {
    const markdown = renderDiff(diffAtlases(before, after));

    expect(markdown).toContain("# Asset atlas diff: v1.0.0 → v1.1.0");
    expect(markdown).toContain("- Files added: 1");
    expect(markdown).toContain("### `kept`");
    expect(markdown).toContain("- `widened`: `{name: string}` → `{gold: boolean, name: string}`");
  });
});

describe("shapeDelta", () => {
  it("trims a wide shape to the span that changed", () => {
    const shared = "x".repeat(100);
    const [beforeDelta, afterDelta] = shapeDelta(
      `{${shared}, b: number}`,
      `{${shared}, b: string}`,
    );

    expect(beforeDelta).toBe(`…${"x".repeat(35)}, b: number}`);
    expect(afterDelta).toBe(`…${"x".repeat(35)}, b: string}`);
  });
});
