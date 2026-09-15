import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PAGE_METADATA, PAGE_METADATA_ENTRIES } from "$lib/server/page-metadata.js";

import { GET } from "../../routes/sitemap.xml/+server.js";
import { errorPageMetadata, SITE_NAME, SITE_ORIGIN } from "./page-metadata.js";

const pageComponents = Object.keys(import.meta.glob("/src/routes/**/+page.svelte"));

function routePathForModule(modulePath: string): string {
  const routeSegments = modulePath
    .replace(/^\/src\/routes\/?/, "")
    .replace(/(^|\/)\+page\.ts$/, "")
    .split("/")
    .filter((segment) => segment && !(segment.startsWith("(") && segment.endsWith(")")));

  return `/${routeSegments.join("/")}`;
}

describe("page metadata", () => {
  it("is provided by every rendered page", () => {
    const metadataModules = PAGE_METADATA_ENTRIES.map(({ modulePath }) =>
      modulePath.replace(/\.ts$/, ".svelte"),
    );

    expect(metadataModules.toSorted()).toEqual(pageComponents.toSorted());

    for (const { metadata, modulePath } of PAGE_METADATA_ENTRIES) {
      expect(metadata.path).toBe(routePathForModule(modulePath));
    }
  });

  it("gives every page distinct, meaningful search text and a canonical URL", () => {
    expect(new Set(PAGE_METADATA.map(({ title }) => title))).toHaveLength(PAGE_METADATA.length);
    expect(new Set(PAGE_METADATA.map(({ description }) => description))).toHaveLength(
      PAGE_METADATA.length,
    );
    expect(new Set(PAGE_METADATA.map(({ path }) => path))).toHaveLength(PAGE_METADATA.length);

    for (const metadata of PAGE_METADATA) {
      expect(metadata.title).not.toContain(SITE_NAME);
      expect(metadata.description).toContain("Fields of Mistria");
      expect(new URL(metadata.path, SITE_ORIGIN).origin).toBe(SITE_ORIGIN);
    }
  });

  it("keeps utility, development, and error pages out of search results", () => {
    expect(PAGE_METADATA.find(({ path }) => path === "/data")?.robots).toBe("noindex, follow");
    expect(PAGE_METADATA.find(({ path }) => path === "/dev/icons")?.robots).toBe(
      "noindex, nofollow",
    );
    expect(errorPageMetadata("/missing", 404)).toMatchObject({
      robots: "noindex, nofollow",
      title: "404",
    });
  });
});

describe("crawler files", () => {
  it("generates the sitemap from indexable page metadata", async () => {
    const sitemap = await GET().text();
    const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    const expected = PAGE_METADATA.filter(({ robots }) => robots === undefined).map(
      ({ path }) => new URL(path, SITE_ORIGIN).href,
    );

    expect(locations).toEqual(expected);
    expect(locations).not.toContain(new URL("/data", SITE_ORIGIN).href);
  });

  it("keeps pages crawlable while excluding sprites from Google Images", () => {
    const robots = readFileSync(resolve(import.meta.dirname, "../../../static/robots.txt"), "utf8");

    expect(robots).toContain("User-agent: Googlebot-Image\nDisallow: /sprites/");
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Sitemap: https://mistria.fyi/sitemap.xml");
  });
});
