import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CATEGORY_KEYS } from "./categories.js";
import {
  INDEXABLE_PAGE_PATHS,
  PAGE_METADATA,
  resolvePageMetadata,
  SITE_ORIGIN,
} from "./page-metadata.js";

const PUBLIC_PATHS = [
  "/",
  ...CATEGORY_KEYS.map((key) => `/${key}` as const),
  "/all",
  "/about",
  "/data",
  "/privacy",
  "/dev/icons",
] as const;

describe("page metadata", () => {
  it("covers every public, utility, and development page", () => {
    expect(Object.keys(PAGE_METADATA).toSorted()).toEqual(PUBLIC_PATHS.toSorted());
  });

  it("gives every page distinct, meaningful search text and a canonical URL", () => {
    const resolved = PUBLIC_PATHS.map((path) => resolvePageMetadata(path, 200));

    expect(new Set(resolved.map(({ title }) => title))).toHaveLength(PUBLIC_PATHS.length);
    expect(new Set(resolved.map(({ description }) => description))).toHaveLength(
      PUBLIC_PATHS.length,
    );

    for (const [index, metadata] of resolved.entries()) {
      expect(metadata.title).toContain("Mistria Field Guide");
      expect(metadata.description).toContain("Fields of Mistria");
      expect(metadata.canonicalUrl).toBe(new URL(PUBLIC_PATHS[index], SITE_ORIGIN).href);
    }
  });

  it("keeps utility, development, and error pages out of search results", () => {
    expect(resolvePageMetadata("/data", 200).robots).toBe("noindex, follow");
    expect(resolvePageMetadata("/dev/icons", 200).robots).toBe("noindex, nofollow");
    expect(resolvePageMetadata("/missing", 404)).toMatchObject({
      robots: "noindex, nofollow",
      title: "404 — Mistria Field Guide",
    });
  });
});

describe("crawler files", () => {
  it("lists exactly the canonical, indexable pages in the sitemap", () => {
    const sitemap = readFileSync(
      resolve(import.meta.dirname, "../../../static/sitemap.xml"),
      "utf8",
    );
    const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    const expected = INDEXABLE_PAGE_PATHS.map((path) => new URL(path, SITE_ORIGIN).href);

    expect(locations).toEqual(expected);
  });

  it("keeps pages crawlable while excluding sprites from Google Images", () => {
    const robots = readFileSync(resolve(import.meta.dirname, "../../../static/robots.txt"), "utf8");

    expect(robots).toContain("User-agent: Googlebot-Image\nDisallow: /sprites/");
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Sitemap: https://mistria.fyi/sitemap.xml");
  });
});
