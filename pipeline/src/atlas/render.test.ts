import { describe, expect, it } from "vitest";

import { renderAtlas } from "./render.js";

import type { AssetAtlas } from "./inventory.js";

const atlas: AssetAtlas = {
  fiddle: [
    {
      claims: [
        { module: "extract/gifts.ts", reference: "npcs.holt.loved_gifts", via: "path" },
        { module: "extract/villagers.ts", reference: "npcs", via: "ancestor" },
      ],
      keys: { a: "string", b: "string", c: "string", d: "string", name: "{first: string}" },
      rootPath: "npcs.holt",
      sourceFile: "npcs/holt.toml",
    },
  ],
  folders: [{ extensions: { ".toml": 1 }, files: ["fiddle/npcs/holt.toml"], name: "fiddle" }],
  version: "9.9.9",
};

describe("renderAtlas", () => {
  it("renders folders, claims by kind, & grouped keys", () => {
    const markdown = renderAtlas(atlas);

    expect(markdown).toContain("# Asset atlas: v9.9.9");
    expect(markdown).toContain("| `fiddle` | 1 | .toml 1 |");
    expect(markdown).toContain("1 roots, 1 claimed by the pipeline (1 named directly).");
    expect(markdown).toContain(
      "| `npcs.holt` | `npcs/holt.toml` | 5 | `extract/gifts.ts` | `extract/villagers.ts` |",
    );
    expect(markdown).toContain(
      "Claimed by: `extract/gifts.ts` (path `npcs.holt.loved_gifts`), `extract/villagers.ts` (ancestor `npcs`)",
    );
    expect(markdown).toContain("- 4 keys (`a`, `b`, `c`, …): `string`");
    expect(markdown).toContain("- `name`: `{first: string}`");
  });
});
