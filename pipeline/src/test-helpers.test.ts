import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAssetsFixture, removeAssetsFixtures, requireGameAssetsDir } from "./test-helpers.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  removeAssetsFixtures();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
  vi.unstubAllEnvs();
});

describe("asset test helpers", () => {
  it("creates and removes a temporary fiddle tree", () => {
    const assetsDir = createAssetsFixture({
      "items/crops.toml": 'turnip = { name = "Turnip" }',
    });
    const fixtureFile = join(assetsDir, "fiddle/items/crops.toml");

    expect(readFileSync(fixtureFile, "utf8")).toContain("Turnip");

    removeAssetsFixtures();
    expect(existsSync(assetsDir)).toBe(false);
  });

  it("requires the resolved game-assets fiddle directory", () => {
    const assetsDir = createAssetsFixture({ "misc.toml": 'version = "1.0.2"' });
    vi.stubEnv("MISTRIA_ASSETS", assetsDir);

    expect(requireGameAssetsDir()).toBe(assetsDir);
  });

  it("reports a missing resolved game-assets directory", () => {
    vi.stubEnv("MISTRIA_ASSETS", "/definitely/missing/mistria-assets");

    expect(() => requireGameAssetsDir()).toThrow(
      "Game assets not found at /definitely/missing/mistria-assets/fiddle",
    );
  });

  it("rejects a regular file in place of the fiddle directory", () => {
    const assetsDir = mkdtempSync(join(tmpdir(), "harvest-helper-invalid-assets-"));
    temporaryDirectories.push(assetsDir);
    writeFileSync(join(assetsDir, "fiddle"), "not a directory");
    vi.stubEnv("MISTRIA_ASSETS", assetsDir);

    expect(() => requireGameAssetsDir()).toThrow(`Game assets not found at ${assetsDir}/fiddle`);
  });
});
