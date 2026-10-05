import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import localeManifest from "#lib/data/locales.json";
import { baseLocale, locales } from "#lib/paraglide/runtime.js";

import { LOCALE_CODES } from "./locale.js";

const settings = JSON.parse(
  readFileSync(new URL("../../../project.inlang/settings.json", import.meta.url), "utf8"),
) as { baseLocale: string; locales: string[] };

// `project.inlang/settings.json` is the authoritative locale list: Paraglide compiles from it.
// `LOCALE_CODES` repeats it as a literal tuple so `LocaleCode` stays a union type, and the pipeline
// generates `locales.json` from the game's own language list. Each copy must match it exactly,
// order included.
describe("locale list", () => {
  it("matches project.inlang/settings.json", () => {
    expect(LOCALE_CODES).toEqual(settings.locales);
    expect(LOCALE_CODES[0]).toBe(settings.baseLocale);
  });

  it("matches the compiled Paraglide runtime", () => {
    expect(LOCALE_CODES).toEqual(locales);
    expect(LOCALE_CODES[0]).toBe(baseLocale);
  });

  it("matches the generated locales.json manifest", () => {
    expect(localeManifest.map((entry) => entry.tag)).toEqual(LOCALE_CODES);
  });
});
