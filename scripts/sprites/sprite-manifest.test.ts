import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { buildSpriteManifest, missingFixtureSizes, spriteKeys } from "./sprite-manifest.js";

const FIXTURE_DIR = fileURLToPath(new URL("../../tests/browser/fixtures/", import.meta.url));
const directories: string[] = [];

function stagedSprites(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "sprite-manifest-"));
  directories.push(root);
  for (const kind of ["items", "villagers"]) mkdirSync(join(root, kind));
  for (const [key, size] of Object.entries(files)) {
    copyFileSync(join(FIXTURE_DIR, `${size}.webp`), join(root, `${key}.webp`));
  }
  return root;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("sprite manifest", () => {
  it("lists every item & villager as a sorted sprite key", () => {
    expect(spriteKeys({ items: { a: {}, b: {} }, villagers: { c: {} } })).toEqual([
      "items/a",
      "items/b",
      "villagers/c",
    ]);
  });

  it("records native dimensions & a null for each unstaged sprite", async () => {
    const root = stagedSprites({ "items/acorn": "18x18", "villagers/adeline": "24x20" });
    await expect(
      buildSpriteManifest(root, ["items/acorn", "items/mob_coin", "villagers/adeline"]),
    ).resolves.toEqual({
      "items/acorn": "18x18",
      "items/mob_coin": null,
      "villagers/adeline": "24x20",
    });
  });

  it("refuses a sprite tree missing a kind", async () => {
    const root = stagedSprites({ "villagers/adeline": "24x20" });
    await expect(buildSpriteManifest(root, ["villagers/adeline"])).rejects.toThrow(
      "No staged items sprites",
    );
  });

  it("names sizes the browser fixture can't serve", () => {
    expect(
      missingFixtureSizes({ a: "18x18", b: "32x32", c: null, d: "32x32" }, FIXTURE_DIR),
    ).toEqual(["32x32"]);
  });
});
