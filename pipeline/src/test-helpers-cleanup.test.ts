import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

import { createAssetsFixture, removeAssetsFixtures } from "./test-helpers";

let assetsDir: string;

afterAll(() => {
  removeAssetsFixtures();
});

describe("automatic asset-fixture cleanup", () => {
  it("creates a fixture for one test", () => {
    assetsDir = createAssetsFixture({ "items/fixture.toml": "[fixture]" });

    expect(existsSync(assetsDir)).toBe(true);
  });

  it("removes the prior test fixture when that test finishes", () => {
    expect(existsSync(assetsDir)).toBe(false);
  });
});
