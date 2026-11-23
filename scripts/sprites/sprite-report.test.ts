import { describe, expect, it } from "vitest";

import { formatSpriteReport } from "./sprite-report.js";

describe("formatSpriteReport", () => {
  it("groups rows without a sprite by category & reason, & lists the Renown rewards", () => {
    const report = formatSpriteReport(
      [
        {
          art: { kind: "sprite", sprite: { id: "hat", kind: "cosmetics" } },
          category: "cosmetics",
          id: "hat",
          kind: "cosmetic",
        },
        {
          art: { kind: "none", reason: "No quest icon." },
          category: "quests",
          id: "a",
          kind: "quest",
        },
        {
          art: { kind: "none", reason: "No quest icon." },
          category: "quests",
          id: "b",
          kind: "quest",
        },
        { art: undefined, category: "recipes", id: "mystery", kind: "recipe" },
      ],
      [{ id: "hat", level: 2, sprite: { id: "hat", kind: "cosmetics" } }],
      ["items/gone (HTTP 404)"],
    );

    expect(report).toContain("1 of 4 Everything rows have a sprite.");
    expect(report).toContain("### quests (2)\n\n- No quest icon. (2)\n  - `a`, `b`");
    expect(report).toContain("### recipes (1)\n\n- **Gap:** no sprite & no no-art entry. (1)");
    expect(report).not.toContain("### cosmetics");
    expect(report).toContain("- Level 2: `hat` → `cosmetics/hat`");
    expect(report).toContain("## Missing sprite files (1)\n\n- `items/gone (HTTP 404)`");
  });

  it("says so when every row has a sprite", () => {
    expect(formatSpriteReport([], [])).toContain("## Rows without a sprite\n\nNone.");
  });
});
