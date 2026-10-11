import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_ASSET_ORIGIN as uploaderOrigin } from "../../scripts/lib/r2-upload.js";
import { ASSET_ORIGIN as fontManifestOrigin } from "../../scripts/locale-fonts/manifest.js";
import { PRODUCTION_ASSET_ORIGIN, resolveSpriteAssetBase } from "./asset-origin.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function read(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

/** Every absolute origin a stylesheet's `url(...)` references. */
function stylesheetOrigins(css: string): Set<string> {
  const urls = css.matchAll(/url\(\s*["']?(https?:\/\/[^"')\s]+)/g);
  return new Set([...urls].map(([, url]) => new URL(url).origin));
}

describe("resolveSpriteAssetBase", () => {
  it("defaults to the production origin", () => {
    expect(resolveSpriteAssetBase(undefined)).toBe(PRODUCTION_ASSET_ORIGIN);
    expect(resolveSpriteAssetBase("")).toBe(PRODUCTION_ASSET_ORIGIN);
    expect(resolveSpriteAssetBase("   ")).toBe(PRODUCTION_ASSET_ORIGIN);
  });

  it("keeps an override's path and drops trailing slashes", () => {
    expect(resolveSpriteAssetBase("http://localhost:8080/assets/")).toBe(
      "http://localhost:8080/assets",
    );
    expect(resolveSpriteAssetBase("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("rejects an override sprite paths can't be appended to", () => {
    expect(() => resolveSpriteAssetBase("assets.example")).toThrow(/absolute URL/);
    expect(() => resolveSpriteAssetBase("ftp://assets.example")).toThrow(/http or https/);
    expect(() => resolveSpriteAssetBase("https://assets.example/?v=1")).toThrow(/query/);
  });
});

describe("one asset origin", () => {
  it("is the only spelling of the origin in app source", () => {
    const sourceRoot = resolve(repositoryRoot, "src");
    const offenders = readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:svelte|ts)$/.test(entry.name))
      .map((entry) =>
        relative(repositoryRoot, resolve(entry.parentPath, entry.name)).split(sep).join("/"),
      )
      .filter(
        (path) =>
          !path.endsWith(".test.ts") &&
          !path.startsWith("src/lib/paraglide/") &&
          path !== "src/lib/asset-origin.ts",
      )
      .filter((path) => read(path).includes(PRODUCTION_ASSET_ORIGIN));

    expect(offenders).toEqual([]);
  });

  it("matches the copies in stylesheets, which can't import it", () => {
    const stylesheets = [
      "src/app.css",
      ...readdirSync(resolve(repositoryRoot, "src/lib/fonts"))
        .filter((name) => name.endsWith(".css"))
        .map((name) => `src/lib/fonts/${name}`),
    ];
    for (const path of stylesheets) {
      expect([...stylesheetOrigins(read(path))], path).toEqual([PRODUCTION_ASSET_ORIGIN]);
    }
  });

  it("matches the locale font manifest and the R2 uploader's default", () => {
    expect(fontManifestOrigin).toBe(PRODUCTION_ASSET_ORIGIN);
    expect(uploaderOrigin).toBe(PRODUCTION_ASSET_ORIGIN);
  });
});
