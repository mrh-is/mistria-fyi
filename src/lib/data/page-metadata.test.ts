import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { _pageEntries, GET as getSitemap } from "../../routes/sitemap.xml/+server.js";
import { locales, localizeUrl } from "../paraglide/runtime.js";
import { categoryKeyForPathname } from "./categories.js";
import { errorPageMetadata, pageMetadata, SITE_NAME, SITE_ORIGIN } from "./page-metadata.js";

import type { PageMetadata } from "./page-metadata.js";

/**
 * Runs every rendered page's `load()` as the base locale would render it, with the minimal event
 * the loads read: the root layout's resolved locale.
 */
function pageMetadataEntries() {
  return _pageEntries().then((pageEntries) =>
    Promise.all(
      pageEntries.map(async (entry) => {
        const data = (await entry.pageModule.load({
          parent: () => Promise.resolve({ locale: "en" }),
        } as never)) as { metadata: PageMetadata };
        return { ...entry, metadata: data.metadata };
      }),
    ),
  );
}

describe("page metadata", () => {
  it("is provided by every rendered page", async () => {
    const entries = await pageMetadataEntries();

    expect(entries).not.toHaveLength(0);
    expect(entries.every(({ metadata }) => metadata.description && metadata.title)).toBe(true);
    expect(entries.some(({ path }) => path === "villagers")).toBe(true);
  });

  it("gives every page distinct, meaningful search text and a canonical URL", async () => {
    const entries = await pageMetadataEntries();
    const metadata = entries.map((entry) => entry.metadata);

    expect(new Set(metadata.map(({ title }) => title))).toHaveLength(metadata.length);
    expect(new Set(metadata.map(({ description }) => description))).toHaveLength(metadata.length);
    expect(new Set(entries.map(({ path }) => path))).toHaveLength(entries.length);

    for (const entry of entries) {
      expect(new URL(entry.path, SITE_ORIGIN).origin).toBe(SITE_ORIGIN);
      expect(entry.metadata.title === SITE_NAME || !entry.metadata.title.includes(SITE_NAME)).toBe(
        true,
      );
    }

    for (const entry of entries.filter(({ metadata: { robots } }) => robots === undefined)) {
      expect(entry.metadata.description).toContain("Fields of Mistria");
    }
  });

  it("resolves toolbar and accent defaults so consumers never see an absent field", () => {
    const base = { description: "A page.", title: "Page" };

    expect(pageMetadata(base)).toEqual({
      ...base,
      accent: "var(--color-home-accent)",
      toolbar: { search: false, worldState: false },
    });
    expect(pageMetadata({ ...base, toolbar: { search: true } }).toolbar).toEqual({
      search: true,
      worldState: false,
    });
    expect(pageMetadata({ ...base, toolbar: "hidden" }).toolbar).toBe("hidden");
    expect(pageMetadata({ ...base, accent: "var(--color-category-mines)" }).accent).toBe(
      "var(--color-category-mines)",
    );
  });

  it("colors category pages with their own accent and everything else with the home accent", async () => {
    const entries = await pageMetadataEntries();

    for (const { metadata, path } of entries) {
      const categoryKey = categoryKeyForPathname(`/${path}`);
      expect(metadata.accent).toBe(
        categoryKey ? `var(--color-category-${categoryKey})` : "var(--color-home-accent)",
      );
    }
  });

  it("hides the toolbar on utility pages and keeps it on the tracker", async () => {
    const entries = await pageMetadataEntries();
    const toolbarFor = (path: string) =>
      entries.find((entry) => entry.path === path)?.metadata.toolbar;

    expect(toolbarFor("about")).toBe("hidden");
    expect(toolbarFor("data")).toBe("hidden");
    expect(toolbarFor("")).toEqual({ search: true, worldState: true });
    expect(toolbarFor("mines")).toEqual({ search: false, worldState: false });
    expect(errorPageMetadata(404, "en").toolbar).toEqual({ search: false, worldState: false });
  });

  it("declares each page's robots directive statically, where the sitemap reads it", async () => {
    for (const { metadata, pageModule } of await pageMetadataEntries()) {
      expect(pageModule._robots).toBe(metadata.robots);
    }
  });

  it("keeps utility, development, and error pages out of search results", async () => {
    const entries = await pageMetadataEntries();

    expect(entries.find(({ path }) => path === "data")?.metadata.robots).toBe("noindex, follow");
    expect(entries.find(({ path }) => path === "dev/icons")?.metadata.robots).toBe(
      "noindex, nofollow",
    );
    expect(errorPageMetadata(404, "en")).toMatchObject({
      robots: "noindex, nofollow",
      title: "404",
    });
  });
});

describe("localized metadata", () => {
  it("renders the home, everything, and error metadata in the page's locale", async () => {
    const [{ load: loadHome }, { load: loadAll }] = await Promise.all([
      import("../../routes/+page.js"),
      import("../../routes/everything/+page.js"),
    ]);
    const event = { parent: () => Promise.resolve({ locale: "ja" }) } as never;
    const home = (await loadHome(event)) as { metadata: PageMetadata };
    const all = (await loadAll(event)) as { metadata: PageMetadata };

    expect(home.metadata.title).toBe(SITE_NAME);
    expect(home.metadata.description).toContain("Fields of Mistria");
    expect(home.metadata.description).not.toMatch(/Track museum/u);
    expect(all.metadata.title).not.toBe("Checklist of everything");
    expect(all.metadata.description).not.toMatch(/View & track/u);
    expect(errorPageMetadata(404, "ja").description).not.toMatch(/could not be found/u);
  });
});

describe("crawler files", () => {
  it("generates the sitemap from indexable page metadata, one locale-prefixed URL per locale", async () => {
    const entries = await pageMetadataEntries();
    const sitemapResponse = await getSitemap();
    const sitemap = await sitemapResponse.text();
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
    const sitemapResponse = await getSitemap();
    const sitemap = await sitemapResponse.text();

    expect(sitemap).toContain(
      `<xhtml:link rel="alternate" hreflang="ja" href="${localizeUrl(new URL("/almanac", SITE_ORIGIN), { locale: "ja" }).href}" />`,
    );
    expect(sitemap).toContain(
      `<xhtml:link rel="alternate" hreflang="en" href="${localizeUrl(new URL("/almanac", SITE_ORIGIN), { locale: "en" }).href}" />`,
    );
  });

  it("keeps every page crawlable", () => {
    const robots = readFileSync(resolve(import.meta.dirname, "../../../static/robots.txt"), "utf8");

    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Sitemap: https://mistria.fyi/sitemap.xml");
  });
});
