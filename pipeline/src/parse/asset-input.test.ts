import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ASSETS_DIR,
  DEFAULT_WINDOWS_GAME_ARCHIVE,
  defaultGameAssetsInput,
  prepareGameAssets,
} from "./asset-input.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("DEFAULT_ASSETS_DIR", () => {
  it("points at pipeline/input/assets regardless of the working directory", () => {
    expect(DEFAULT_ASSETS_DIR).toBe(resolve(import.meta.dirname, "../../input/assets"));
    expect(DEFAULT_ASSETS_DIR.endsWith(`${sep}${join("pipeline", "input", "assets")}`)).toBe(true);
  });
});

describe("defaultGameAssetsInput", () => {
  it("reads the installed Steam archive on Windows, with no local fallback", () => {
    expect(defaultGameAssetsInput("win32")).toBe(DEFAULT_WINDOWS_GAME_ARCHIVE);
  });

  it.each(["darwin", "linux"] as const)("reads pipeline/input/assets on %s", (platform) => {
    expect(defaultGameAssetsInput(platform)).toBe(DEFAULT_ASSETS_DIR);
  });
});

describe("prepareGameAssets", () => {
  it("names a missing archive rather than looking for fiddle/ beside it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mistria-asset-input-"));
    directories.push(directory);
    const archive = join(directory, "assets.zip");
    await expect(prepareGameAssets(archive)).rejects.toThrow(
      `Game archive not found at ${archive}`,
    );
  });

  it("names a missing assets directory's fiddle/", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mistria-asset-input-"));
    directories.push(directory);
    await expect(prepareGameAssets(directory)).rejects.toThrow(
      `Game assets not found at ${join(directory, "fiddle")}`,
    );
  });
});
