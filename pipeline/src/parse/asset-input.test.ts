import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_WINDOWS_GAME_ARCHIVE,
  defaultAssetsDir,
  defaultGameAssetsInput,
  INPUT_ROOT,
  prepareGameAssets,
  readCommittedGameVersion,
  resolveVersionedAssetsDir,
} from "./asset-input.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("defaultAssetsDir", () => {
  it("points at pipeline/input/vX.Y.Z/assets regardless of the working directory", () => {
    expect(INPUT_ROOT).toBe(resolve(import.meta.dirname, "../../input"));
    expect(defaultAssetsDir("1.0.6")).toBe(join(INPUT_ROOT, "v1.0.6", "assets"));
    expect(INPUT_ROOT.endsWith(`${sep}${join("pipeline", "input")}`)).toBe(true);
  });

  it("defaults to the committed tracker data's version", () => {
    expect(defaultAssetsDir()).toBe(join(INPUT_ROOT, `v${readCommittedGameVersion()}`, "assets"));
  });
});

describe("defaultGameAssetsInput", () => {
  it("reads the installed Steam archive on Windows, with no local fallback", () => {
    expect(defaultGameAssetsInput("win32")).toBe(DEFAULT_WINDOWS_GAME_ARCHIVE);
  });

  it.each(["darwin", "linux"] as const)("reads pipeline/input/vX.Y.Z/assets on %s", (platform) => {
    expect(defaultGameAssetsInput(platform)).toBe(defaultAssetsDir());
  });
});

function gameFilesRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "mistria-game-files-"));
  directories.push(root);
  mkdirSync(join(root, "v1.0.6", "assets", "fiddle"), { recursive: true });
  mkdirSync(join(root, "archive"));
  return root;
}

describe("resolveVersionedAssetsDir", () => {
  it("picks the requested version's assets folder", () => {
    const root = gameFilesRoot();
    expect(resolveVersionedAssetsDir(root, "1.0.6")).toBe(join(root, "v1.0.6", "assets"));
  });

  it("names the expected path for a missing version", () => {
    const root = gameFilesRoot();
    expect(() => resolveVersionedAssetsDir(root, "9.9.9")).toThrow(
      join(root, "v9.9.9", "assets", "fiddle"),
    );
  });

  it("requires a version for a versioned root", () => {
    expect(() => resolveVersionedAssetsDir(gameFilesRoot(), undefined)).toThrow("--version");
  });

  it("passes an assets directory through unchanged", () => {
    const assets = join(gameFilesRoot(), "v1.0.6", "assets");
    expect(resolveVersionedAssetsDir(assets, "1.0.7")).toBe(assets);
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
