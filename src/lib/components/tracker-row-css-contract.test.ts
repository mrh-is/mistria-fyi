import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SHARED_VARS = [
  "--tracker-paper-border-width",
  "--tracker-paper-line",
  "--tracker-paper-radius",
  "--tracker-peek-size",
  "--tracker-row-gap",
  "--tracker-sheet-gap",
  "--tracker-target-size",
  "--tracker-row-min-size",
  "--tracker-sprite-size",
  "--tracker-source-inset",
];

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("tracker row CSS contract", () => {
  const appCss = read("../../app.css");

  it("defines every shared custom property once, in app.css, for rows & stacks alike", () => {
    for (const name of SHARED_VARS) {
      expect(appCss.match(new RegExp(`^\\s*${name}:`, "gm"))?.length ?? 0).toBeGreaterThanOrEqual(
        1,
      );
    }
    expect(appCss).toMatch(/:where\(\[data-tracker-row\], \[data-tracker-row-stack\]\)/);
  });

  it.each(["tracker-row.svelte", "tracker-row-stack.svelte"])(
    "leaves %s to per-row corner state only",
    (file) => {
      const source = read(file);
      for (const name of SHARED_VARS) {
        expect(source).not.toMatch(new RegExp(`^\\s*${name}:`, "m"));
      }
    },
  );
});
