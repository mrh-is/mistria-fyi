import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

import { createAssetsFixture, removeAssetsFixtures } from "./test-helpers.js";

let assetsDir: string | undefined;

afterAll(() => {
  removeAssetsFixtures();
});

describe("automatic asset-fixture cleanup", () => {
  it("creates a fixture for one test", () => {
    assetsDir = createAssetsFixture({ "items/fixture.toml": "[fixture]" });

    expect(existsSync(assetsDir)).toBe(true);
  });

  // Depends on the previous test: onTestFinished only fires after its test, so the removal is
  // observable only from a later one. Fail loudly (rather than pass vacuously) if run alone.
  it("removes the prior test fixture when that test finishes", () => {
    expect(assetsDir, "run together with the previous test").toBeDefined();
    expect(existsSync(assetsDir ?? "")).toBe(false);
  });
});
