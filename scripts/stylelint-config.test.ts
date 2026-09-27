import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import config from "../stylelint.config.js";

async function lintSvelte(css: string): Promise<string[]> {
  const result = await stylelint.lint({
    code: `<div class="x"></div>\n\n<style>\n  .x {\n${css}\n  }\n</style>\n`,
    codeFilename: "src/lib/components/example.svelte",
    config,
  });
  // Disable-comment problems (e.g. a missing justification) land in warnings too.
  return result.results.flatMap((lintResult) => lintResult.warnings.map(({ rule }) => rule));
}

describe("stylelint config", () => {
  it("accepts token-based declarations", async () => {
    await expect(
      lintSvelte(`
    color: var(--ink);
    background: color-mix(in srgb, var(--paper) 72%, transparent);
    border-radius: var(--radius);
    box-shadow: var(--shadow-small);
    font-size: var(--text-2xs);`),
    ).resolves.toEqual([]);
  });

  it.each([
    ["a hex color", "color: #fff8e9;", "color-no-hex"],
    ["a named color", "color: white;", "color-named"],
    ["an rgb() color", "background: rgb(46 42 34 / 4%);", "function-disallowed-list"],
    ["an oklch() color", "color: oklch(70% 0.1 60);", "function-disallowed-list"],
    ["a pixel font size", "font-size: 11px;", "declaration-property-unit-disallowed-list"],
    ["a rem font size", "font-size: 0.6875rem;", "declaration-property-unit-disallowed-list"],
    ["a pixel radius", "border-radius: 2px;", "declaration-property-unit-disallowed-list"],
    [
      "a logical pixel radius",
      "border-start-end-radius: 4px;",
      "declaration-property-unit-disallowed-list",
    ],
    [
      "a pixel shadow",
      "box-shadow: 0 3px 8px var(--ink);",
      "declaration-property-unit-disallowed-list",
    ],
  ])("rejects %s", async (_label, declaration, rule) => {
    await expect(lintSvelte(declaration)).resolves.toContain(rule);
  });

  it("allows a justified disable comment", async () => {
    await expect(
      lintSvelte(`
    /* stylelint-disable-next-line color-no-hex -- fixed share-image ink */
    color: #514b45;`),
    ).resolves.toEqual([]);
  });

  it("rejects a disable comment without a justification", async () => {
    await expect(
      lintSvelte(`
    /* stylelint-disable-next-line color-no-hex */
    color: #514b45;`),
    ).resolves.toEqual(["--report-descriptionless-disables"]);
  });
});
