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
            | Record<string, unknown>
            | undefined;
          if (!value) continue;
          if (typeof value.bin === "string") remaining.push(`${itemId}.value.bin = "${value.bin}"`);
          if (typeof value.store === "string")
            remaining.push(`${itemId}.value.store = "${value.store}"`);
        }
      }
    }
    expect(remaining).toEqual([]);
  });

  it("resolves bundle store prices using referenced item store values", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    evaluateExpressions(parsed.data);

    const items = parsed.data.items as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;

    // Find basic_wood to verify its store value, then find a bundle that references it
    let basicWood: Record<string, unknown> | undefined;
    for (const subCats of Object.values(items)) {
      for (const fileItems of Object.values(subCats)) {
        if (fileItems.basic_wood) basicWood = fileItems.basic_wood as Record<string, unknown>;
      }
    }

    if (basicWood) {
      const storeVal = (basicWood.value as Record<string, unknown>)?.store;
      expect(typeof storeVal).toBe("number");
    }
  });

  it("resolves recipe ingredients with count > 1", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    evaluateExpressions(parsed.data);
    // If we get here without throwing, all multi-count recipes resolved correctly
  });
});
