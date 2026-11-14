import { describe, expect, it } from "vitest";

import { localeFromPath, localizePath, localizeUrl, stripLocale } from "./locale-path.js";

describe("locale paths", () => {
  it("accepts canonical locale segments and strips only that segment", () => {
    expect(localeFromPath("/zh-Hant/about")).toBe("zh-Hant");
    expect(localeFromPath("/zh-hant/about")).toBeUndefined();
    expect(stripLocale("/ja")).toBe("/");
    expect(stripLocale("/ja/almanac")).toBe("/almanac");
    expect(stripLocale("/ja//other")).toBe("/ja//other");
    expect(stripLocale("/japan")).toBe("/japan");
  });

  it("replaces locale prefixes and leaves infrastructure routes bare", () => {
    expect(localizePath("/", "en")).toBe("/en");
    expect(localizePath("/ja/about", "es")).toBe("/es/about");
    expect(localizePath("/api/feedback", "es")).toBe("/api/feedback");
    expect(localizePath("/sitemap.xml", "es")).toBe("/sitemap.xml");
  });

  it("keeps the original URL and preserves its query and fragment", () => {
    const original = new URL("https://mistria.fyi/ja/about?from=privacy#data");
    expect(localizeUrl(original, "es").href).toBe("https://mistria.fyi/es/about?from=privacy#data");
    expect(original.pathname).toBe("/ja/about");
  });
});
