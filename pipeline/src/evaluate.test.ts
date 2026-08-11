import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "./evaluate.js";
import { parseFiddle } from "./parse-fiddle.js";

describe("evaluateExpressions", () => {
  it("resolves bonsai values using sapling store prices", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    evaluateExpressions(parsed.data);

    const items = parsed.data.items as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;

    // Find lemon_bonsai and cherry_bonsai across item files
    let lemonBonsai: Record<string, unknown> | undefined;
    let cherryBonsai: Record<string, unknown> | undefined;
    for (const subCats of Object.values(items)) {
      for (const fileItems of Object.values(subCats)) {
        if (fileItems.lemon_bonsai) lemonBonsai = fileItems.lemon_bonsai as Record<string, unknown>;
        if (fileItems.cherry_bonsai)
          cherryBonsai = fileItems.cherry_bonsai as Record<string, unknown>;
      }
    }

    expect(lemonBonsai).toBeDefined();
    expect(cherryBonsai).toBeDefined();
    const lemonValue = (lemonBonsai!.value as Record<string, unknown>).bin;
    const cherryValue = (cherryBonsai!.value as Record<string, unknown>).bin;
    expect(lemonValue).toBe(462);
    expect(cherryValue).toBe(462);
  });

  it("resolves all value expressions with no remaining strings", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    evaluateExpressions(parsed.data);

    const items = parsed.data.items as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    const remaining: string[] = [];
    for (const subCats of Object.values(items)) {
      for (const fileItems of Object.values(subCats)) {
        for (const [itemId, item] of Object.entries(fileItems)) {
          if (typeof item !== "object" || item === null) continue;
          const value = (item as Record<string, unknown>).value as
            Record<string, unknown> | undefined;
          if (!value) continue;
          if (typeof value.bin === "string") remaining.push(`${itemId}.value.bin = "${value.bin}"`);
          if (typeof value.store === "string")
            remaining.push(`${itemId}.value.store = "${value.store}"`);
        }
      }
    }
    expect(remaining).toEqual([]);
  });

  it("keeps a representative referenced store value numeric", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    evaluateExpressions(parsed.data);

    const items = parsed.data.items as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;

    // Verify a representative referenced store value remains numeric; this does not assert a
    // bundle's computed total.
    let basicWood: Record<string, unknown> | undefined;
    for (const subCats of Object.values(items)) {
      for (const fileItems of Object.values(subCats)) {
        if (fileItems.basic_wood) basicWood = fileItems.basic_wood as Record<string, unknown>;
      }
    }

    if (basicWood) {
      const referencedStoreValue = (basicWood.value as Record<string, unknown>)?.store;
      expect(typeof referencedStoreValue).toBe("number");
    }
  });

  it("does not throw on fixture recipes with ingredient counts greater than one", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    evaluateExpressions(parsed.data);
    // Fixture-wide no-throw smoke test; it does not assert a specific computed value.
  });
});
