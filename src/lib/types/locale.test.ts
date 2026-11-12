import { describe, expect, it } from "vitest";

import localeManifest from "#lib/data/locales.json";

import { LOCALE_CODES } from "./locale.js";

describe("locale list", () => {
  it("keeps English as the base locale", () => {
    expect(LOCALE_CODES[0]).toBe("en");
  });

  it("matches the generated locales.json manifest", () => {
    expect(localeManifest.map((entry) => entry.tag)).toEqual(LOCALE_CODES);
  });
});
