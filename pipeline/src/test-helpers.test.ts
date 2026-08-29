import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAssetsFixture, removeAssetsFixtures, requireGameAssetsDir } from "./test-helpers.js";

afterEach(() => {
  removeAssetsFixtures();
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
});
