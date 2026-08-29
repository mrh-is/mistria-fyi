import { afterEach, describe, expect, it } from "vitest";

import { evaluateExpressions } from "./evaluate.js";
import { parseFiddle } from "./parse-fiddle.js";
import { createAssetsFixture, removeAssetsFixtures } from "./test-helpers.js";

afterEach(() => {
  removeAssetsFixtures();
});

describe("evaluateExpressions", () => {
  it("resolves referenced store and counted recipe-cost expressions", () => {
    const assetsDir = createAssetsFixture({
      "items/other/values.toml": `
        [basic_wood.value]
        bin = 4
        store = 10

        [bundle.value]
        store = "basic_wood.store * 3"

        [crafted]
        recipe = [{ count = 2, item = "basic_wood" }]

        [crafted.value]
        bin = "self.recipe * 1.5"
      `,
    });
    const parsed = parseFiddle(assetsDir);

    evaluateExpressions(parsed.data);

    const items = (
      parsed.data.items as Record<string, Record<string, Record<string, Record<string, unknown>>>>
    ).other.values;
    expect((items.bundle.value as Record<string, unknown>).store).toBe(30);
    expect((items.crafted.value as Record<string, unknown>).bin).toBe(12);
  });
});
