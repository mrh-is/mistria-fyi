import { describe, expect, it } from "vitest";

import { localizedHref } from "./localized-href.js";

import type { Path } from "$app/types";

describe("localizedHref", () => {
  it("prefixes the root path with the locale", () => {
    expect(localizedHref("/" as Path, { locale: "en" })).toBe("/en");
  });

  it("prefixes each locale distinctly", () => {
    expect(localizedHref("/" as Path, { locale: "ja" })).toBe("/ja");
  });

  it("keeps the route path after the locale segment", () => {
    expect(localizedHref("/dates" as Path, { locale: "fr" })).toBe("/fr/dates");
  });
});
