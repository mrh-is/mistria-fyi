import { readdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import dimensions from "./fixtures/sprite-dimensions.json";

describe("browser network fixtures", () => {
  it("keeps each fixture’s measured native dimensions", async () => {
    for (const size of new Set(Object.values(dimensions))) {
      if (size === null) continue;
      const [width, height] = size.split("x").map(Number);
      const metadata = await sharp(
        readFileSync(new URL(`fixtures/${size}.webp`, import.meta.url)),
      ).metadata();
      expect([metadata.width, metadata.height], size).toEqual([width, height]);
    }
  });

  it("requires every browser spec to use the guarded test fixture", () => {
    for (const directory of ["accessibility", "pwa"]) {
      const root = new URL(`../${directory}/`, import.meta.url);
      for (const file of readdirSync(root).filter((name) => name.endsWith(".spec.ts"))) {
        const source = readFileSync(new URL(file, root), "utf8");
        expect(source, `${directory}/${file}`).toContain('from "../browser/test.js"');
        expect(source, `${directory}/${file}`).not.toMatch(
          /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/,
        );
      }
    }
  });
});
