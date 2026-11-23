import { readdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { everythingSpriteKeys } from "#lib/sprites/everything-sprites.js";

import { spriteKeys } from "../../scripts/sprites/sprite-manifest.js";
import trackerData from "../../src/lib/data/tracker-data.json";
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

  it("has a manifest entry for every sprite the tracker data can request", () => {
    expect(
      Object.keys(dimensions),
      "Sprite manifest is stale; stage sprites & run pnpm run sprites:manifest",
    ).toEqual(spriteKeys(trackerData, everythingSpriteKeys()));
  });

  // Items keep a few reviewed production 404s (`MISSING_SPRITE_OVERRIDES`); every other kind's
  // rows either have art or sit on the no-art list, which never reaches the manifest.
  it("records a staged sprite for every sprite Everything's other kinds request", () => {
    const missing = everythingSpriteKeys().filter(
      (key) =>
        !key.startsWith("items/") &&
        !key.startsWith("villagers/") &&
        (dimensions as Record<string, null | string>)[key] === null,
    );
    expect(missing, "Stage these sprites, or list the rows in src/lib/sprites/no-art.ts").toEqual(
      [],
    );
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
