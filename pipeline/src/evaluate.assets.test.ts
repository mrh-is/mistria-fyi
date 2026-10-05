import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "./evaluate.js";
import { parseFiddle } from "./parse-fiddle.js";
import { requireGameAssetsDir } from "./test-helpers.js";

describe("evaluateExpressions — v1.0.5 assets", () => {
  it("resolves every supported item value expression", () => {
    const parsed = parseFiddle(requireGameAssetsDir());

    expect(() => {
      evaluateExpressions(parsed.data);
    }).not.toThrow();

    const items = parsed.data.items as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    let lemonBonsai: Record<string, unknown> | undefined;
    let cherryBonsai: Record<string, unknown> | undefined;
    for (const categoryFiles of Object.values(items)) {
      for (const itemsInFile of Object.values(categoryFiles)) {
        lemonBonsai ??= itemsInFile.lemon_bonsai;
        cherryBonsai ??= itemsInFile.cherry_bonsai;
      }
    }

    expect(lemonBonsai).toMatchObject({ value: { bin: 462 } });
    expect(cherryBonsai).toMatchObject({ value: { bin: 462 } });
  });
});
