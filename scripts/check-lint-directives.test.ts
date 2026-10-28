import { describe, expect, it } from "vitest";

import { lintedFiles, unjustifiedDirectives } from "./check-lint-directives.js";

describe("unjustifiedDirectives in scripts", () => {
  it("accepts directives that give a reason after --", () => {
    const text = [
      "// oxlint-disable-next-line no-await-in-loop -- Steps run in order.",
      "/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Runtime JSON,",
      "   cast at the boundary. */",
      "const x = 1; // eslint-disable-line no-console -- Debug output.",
    ].join("\n");
    expect(unjustifiedDirectives("a.ts", text)).toEqual([]);
  });

  it("reports the line number of each directive without a reason", () => {
    const text = [
      "// oxlint-disable-next-line no-await-in-loop",
      "/* eslint-disable */",
      "const x = 1; // eslint-disable-line no-console",
      "// eslint-disable-next-line no-console --",
    ].join("\n");
    expect(unjustifiedDirectives("a.js", text)).toEqual([1, 2, 3, 4]);
  });

  it("ignores enable directives, prose, & directive-shaped strings", () => {
    const text = [
      "/* eslint-enable @typescript-eslint/no-unnecessary-condition */",
      "// flagged and need an eslint-disable comment, so add one",
      'const probe = "// oxlint-disable-next-line no-console";',
      "const template = `/* eslint-disable */`;",
    ].join("\n");
    expect(unjustifiedDirectives("a.ts", text)).toEqual([]);
  });
});

describe("unjustifiedDirectives in Svelte components", () => {
  it("checks script & template comments, not strings or markup text", () => {
    const text = [
      '<script lang="ts">',
      "  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch index.",
      '  const label = "// oxlint-disable-next-line no-console";',
      "  // oxlint-disable-next-line no-console",
      "</script>",
      "",
      "<!-- eslint-disable-next-line svelte/no-at-html-tags -- Sanitized upstream. -->",
      "<p>{label}</p>",
      "<!-- eslint-disable-next-line svelte/no-at-html-tags -->",
      "<p>eslint-disable is plain text here</p>",
    ].join("\n");
    expect(unjustifiedDirectives("a.svelte", text)).toEqual([4, 9]);
  });
});

describe("lintedFiles", () => {
  it("keeps only files oxlint or ESLint lint", () => {
    expect(
      lintedFiles(["README.md", "a.ts", "b.svelte", "c.svelte.js", "d.mjs", "e.css", "f.sh"]),
    ).toEqual(["a.ts", "b.svelte", "c.svelte.js", "d.mjs"]);
  });
});
