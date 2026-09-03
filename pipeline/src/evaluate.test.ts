import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "./evaluate.js";
import { parseFiddle } from "./parse-fiddle.js";
import { createAssetsFixture } from "./test-helpers.js";

describe("evaluateExpressions", () => {
  it("resolves referenced store and counted recipe-cost expressions", () => {
    // Evaluation errors include parser provenance, so this must use a parsed tree rather than
    // makeFiddle.
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

  it("reports value dependency cycles with source provenance", () => {
    const assetsDir = createAssetsFixture({
      "items/other/cycle.toml": `
        [first.value]
        store = "second.store * 1"

        [second.value]
        store = "first.store * 1"
      `,
    });
    const parsed = parseFiddle(assetsDir);

    expect(() => {
      evaluateExpressions(parsed.data);
    }).toThrow(
      /Value cycle: .*first\.value\.store.*second\.value\.store.*items\/other\/cycle\.toml/,
    );
  });

  it("rejects unknown expressions with source provenance", () => {
    const assetsDir = createAssetsFixture({
      "items/other/unknown.toml": `
        [mystery.value]
        bin = "mystery.store + 1"
      `,
    });
    const parsed = parseFiddle(assetsDir);

    expect(() => {
      evaluateExpressions(parsed.data);
    }).toThrow(
      'Unknown expression pattern "mystery.store + 1" on item "mystery" in items/other/unknown.toml',
    );
  });

  it.each([
    { expected: 16, multiplier: "2" },
    { expected: 80, multiplier: "10" },
    { expected: 12, multiplier: "1.5" },
    { expected: 6, multiplier: "0.75" },
  ])("accepts valid recipe multiplier $multiplier", ({ expected, multiplier }) => {
    const assetsDir = createAssetsFixture({
      "items/other/values.toml": `
        [basic_wood.value]
        bin = 4

        [crafted]
        recipe = [{ count = 2, item = "basic_wood" }]

        [crafted.value]
        bin = "self.recipe * ${multiplier}"
      `,
    });
    const parsed = parseFiddle(assetsDir);

    evaluateExpressions(parsed.data);

    const items = (
      parsed.data.items as Record<string, Record<string, Record<string, Record<string, unknown>>>>
    ).other.values;
    expect((items.crafted.value as Record<string, unknown>).bin).toBe(expected);
  });

  it.each([
    { desc: "zero integer", multiplier: "0" },
    { desc: "zero decimal", multiplier: "0.0" },
    { desc: "multiple decimal points", multiplier: "1.2.3" },
    { desc: "scientific notation", multiplier: "1.2e3" },
    { desc: "non-numeric", multiplier: "abc" },
    { desc: "negative sign", multiplier: "-2" },
    { desc: "positive sign", multiplier: "+2" },
    { desc: "leading decimal point", multiplier: ".5" },
    { desc: "trailing decimal point", multiplier: "2." },
    { desc: "empty string", multiplier: "" },
  ])("rejects malformed recipe multiplier: $desc ($multiplier)", ({ multiplier }) => {
    const assetsDir = createAssetsFixture({
      "items/other/values.toml": `
        [basic_wood.value]
        bin = 4

        [crafted]
        recipe = [{ count = 2, item = "basic_wood" }]

        [crafted.value]
        bin = "self.recipe * ${multiplier}"
      `,
    });
    const parsed = parseFiddle(assetsDir);

    expect(() => {
      evaluateExpressions(parsed.data);
    }).toThrow(/items\/other\/values\.toml/);
  });

  it("rejects duplicate item IDs with both source files", () => {
    const assetsDir = createAssetsFixture({
      "items/other/first.toml": "[duplicate.value]\nbin = 1",
      "items/resources/second.toml": "[duplicate.value]\nbin = 2",
    });
    const parsed = parseFiddle(assetsDir);
    const evaluate = () => {
      evaluateExpressions(parsed.data);
    };

    expect(evaluate).toThrow('Duplicate item ID "duplicate"');
    expect(evaluate).toThrow("items/other/first.toml");
    expect(evaluate).toThrow("items/resources/second.toml");
  });
});
