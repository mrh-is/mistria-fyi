import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { _pageMetadataEntries, GET } from "../../routes/sitemap.xml/+server.js";
import { locales, localizeUrl } from "../paraglide/runtime.js";
import { errorPageMetadata, SITE_NAME, SITE_ORIGIN } from "./page-metadata.js";

describe("page metadata", () => {
  it("is provided by every rendered page", async () => {
    const entries = await _pageMetadataEntries();

    expect(entries).not.toHaveLength(0);
    expect(entries.every(({ metadata }) => metadata.description && metadata.title)).toBe(true);
    expect(entries.some(({ path }) => path === "/characters")).toBe(true);
  });

  it("gives every page distinct, meaningful search text and a canonical URL", async () => {
    const entries = await _pageMetadataEntries();
    const metadata = entries.map((entry) => entry.metadata);

    expect(new Set(metadata.map(({ title }) => title))).toHaveLength(metadata.length);
    expect(new Set(metadata.map(({ description }) => description))).toHaveLength(metadata.length);
    expect(new Set(entries.map(({ path }) => path))).toHaveLength(entries.length);

    for (const entry of entries) {
      expect(new URL(entry.path, SITE_ORIGIN).origin).toBe(SITE_ORIGIN);
      expect(entry.metadata.title === SITE_NAME || !entry.metadata.title.includes(SITE_NAME)).toBe(
        true,
      );

      if (entry.metadata.robots === undefined) {
        expect(entry.metadata.description).toContain("Fields of Mistria");
      }
    }
  });

  it("keeps utility, development, and error pages out of search results", async () => {
    const entries = await _pageMetadataEntries();

    expect(entries.find(({ path }) => path === "/data")?.metadata.robots).toBe("noindex, follow");
    expect(entries.find(({ path }) => path === "/dev/icons")?.metadata.robots).toBe(
      "noindex, nofollow",
    );
    expect(errorPageMetadata(404)).toMatchObject({
      robots: "noindex, nofollow",
      title: "404",
    });
  });
});

describe("crawler files", () => {
  it("generates the sitemap from indexable page metadata, one locale-prefixed URL per locale", async () => {
    const entries = await _pageMetadataEntries();
    const sitemap = await (await GET()).text();
    const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    const expected = entries
      .filter(({ metadata }) => metadata.robots === undefined)
      .flatMap(({ path }) =>
        locales.map((locale) => localizeUrl(new URL(path, SITE_ORIGIN), { locale }).href),
      );

    expect(locations).toEqual(expected);
    expect(locations).not.toContain(new URL("/data", SITE_ORIGIN).href);
    expect(locations.some((loc) => loc.includes("[locale]"))).toBe(false);
  });

  it("cross-links every locale's sitemap entry to every other locale via hreflang", async () => {
    const sitemap = await (await GET()).text();

    expect(sitemap).toContain(
      `<xhtml:link rel="alternate" hreflang="ja" href="${localizeUrl(new URL("/almanac", SITE_ORIGIN), { locale: "ja" }).href}" />`,
    );
    expect(sitemap).toContain(
      `<xhtml:link rel="alternate" hreflang="en" href="${localizeUrl(new URL("/almanac", SITE_ORIGIN), { locale: "en" }).href}" />`,
    );
  });

  it("keeps pages crawlable while excluding sprites from Google Images", () => {
    const robots = readFileSync(resolve(import.meta.dirname, "../../../static/robots.txt"), "utf8");

    expect(robots).toContain("User-agent: Googlebot-Image\nDisallow: /sprites/");
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Sitemap: https://mistria.fyi/sitemap.xml");
  });
});
