import { describe, expect, it } from "vitest";

import { skipsFsModuleCache } from "./vitest-svelte-css-cache.js";

const styled = '<script lang="ts"></script>\n<p>Hi</p>\n<style>\n  p { margin: 0; }\n</style>\n';

describe("Svelte CSS & the fs module cache", () => {
  it("skips a styled component, whose CSS module needs its in-process compile", () => {
    expect(skipsFsModuleCache({ id: "/src/card.svelte", sourceCode: styled })).toBe(true);
  });

  it("caches a component without a style block", () => {
    expect(skipsFsModuleCache({ id: "/src/card.svelte", sourceCode: "<p>Hi</p>" })).toBe(false);
  });

  it.each(["/src/card.svelte?svelte&type=style&lang.css", "/src/store.svelte.ts", "/src/a.ts"])(
    "caches %s",
    (id) => {
      expect(skipsFsModuleCache({ id, sourceCode: styled })).toBe(false);
    },
  );
});
