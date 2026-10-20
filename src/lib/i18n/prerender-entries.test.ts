import { describe, expect, it } from "vitest";

import { locales, localizeHref } from "#lib/paraglide/runtime.js";

import { PRERENDER_ENTRIES, PRERENDERED_ROUTES } from "./prerender-entries.js";

describe("prerender entries", () => {
  it("lists every prerendered route at Paraglide's prefixed path in every locale", () => {
    const localized = locales.flatMap((locale) =>
      PRERENDERED_ROUTES.map((route) => localizeHref(route, { locale })),
    );
    expect(PRERENDER_ENTRIES.filter((entry) => entry !== "/sitemap.xml").toSorted()).toEqual(
      localized.toSorted(),
    );
  });

  it("never lists an unprefixed page, which would prerender a locale redirect", () => {
    for (const route of PRERENDERED_ROUTES) expect(PRERENDER_ENTRIES).not.toContain(route);
  });

  it("keeps the sitemap, which is prerendered outside the locale prefixes", () => {
    expect(PRERENDER_ENTRIES).toContain("/sitemap.xml");
  });
});
