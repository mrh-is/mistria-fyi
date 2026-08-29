import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "./evaluate.js";
import { parseFiddle } from "./parse-fiddle.js";
import { requireGameAssetsDir } from "./test-helpers.js";

describe("evaluateExpressions — v1.0.2 assets", () => {
  it("resolves every supported item value expression", () => {
    const parsed = parseFiddle(requireGameAssetsDir());

    evaluateExpressions(parsed.data);

    const items = parsed.data.items as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    const unresolved: string[] = [];
    for (const categoryFiles of Object.values(items)) {
      for (const itemsInFile of Object.values(categoryFiles)) {
        for (const [itemId, item] of Object.entries(itemsInFile)) {
          if (typeof item !== "object" || item === null) continue;
          const value = item.value as Record<string, unknown> | undefined;
          if (!value) continue;
          if (typeof value.bin === "string") unresolved.push(`${itemId}.value.bin`);
          if (typeof value.store === "string") unresolved.push(`${itemId}.value.store`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });
});
