import { describe, expect, it } from "vitest";

import { lintedFiles, unjustifiedDirectives } from "./check-lint-directives.js";

describe("unjustifiedDirectives", () => {
  it("accepts directives that give a reason after --", () => {
    const text = [
      "// oxlint-disable-next-line no-await-in-loop -- Steps run in order.",
      "  /* eslint-disable @typescript-eslint/no-unnecessary-condition -- Runtime JSON. */",
      "<!-- eslint-disable-next-line svelte/no-at-html-tags -- Sanitized upstream. -->",
      "const x = 1; // eslint-disable-line no-console -- Debug output.",
    ].join("\n");
    expect(unjustifiedDirectives(text)).toEqual([]);
  });

  it("reports the line number of each directive without a reason", () => {
    const text = [
      "// oxlint-disable-next-line no-await-in-loop",
      "/* eslint-disable */",
      "<!-- eslint-disable-next-line svelte/no-at-html-tags -->",
      "// eslint-disable-next-line no-console --",
    ].join("\n");
    expect(unjustifiedDirectives(text)).toEqual([1, 2, 3, 4]);
  });

  it("ignores enable directives & prose that mentions a directive", () => {
    const text = [
      "/* eslint-enable @typescript-eslint/no-unnecessary-condition */",
      "// flagged and need an eslint-disable comment, so add one",
      'const probe = "// oxlint-disable-next-line no-console";',
    ].join("\n");
    expect(unjustifiedDirectives(text)).toEqual([]);
  });
});

describe("lintedFiles", () => {
  it("keeps only files oxlint or ESLint lint", () => {
    expect(
      lintedFiles(["README.md", "a.ts", "b.svelte", "c.svelte.js", "d.mjs", "e.css", "f.sh"]),
    ).toEqual(["a.ts", "b.svelte", "c.svelte.js", "d.mjs"]);
  });
});
