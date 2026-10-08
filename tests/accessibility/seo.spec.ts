import { SITE_NAME, SITE_ORIGIN } from "../../src/lib/data/page-metadata.js";
import { LOCALE_CODES } from "../../src/lib/types/locale.js";
import { expect, test } from "../browser/test.js";

import type { APIRequestContext } from "@playwright/test";

const HOME_PATH_PATTERN = new RegExp(`^/(?:${LOCALE_CODES.join("|")})$`);

function sitemapLocale(path: string): string | undefined {
  return LOCALE_CODES.find((locale) => path === `/${locale}` || path.startsWith(`/${locale}/`));
}

async function sitemapPaths(request: APIRequestContext): Promise<string[]> {
  const response = await request.get("/sitemap.xml");
  const sitemap = await response.text();
  return [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
    ([, location]) => new URL(location).pathname,
  );
}

test.use({ javaScriptEnabled: false });

test.describe("server-rendered search metadata", () => {
  test("the former characters route is not redirected", async ({ page }) => {
    const response = await page.goto("/characters");

    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(/\/characters$/);
  });

  test("every sitemap page is locale-prefixed", async ({ request }) => {
    const paths = await sitemapPaths(request);

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((path) => sitemapLocale(path) === undefined)).toEqual([]);
  });

  // One test per locale rather than one loop over the whole sitemap: the full loop took over
  // 100 seconds serially, which set the floor for whichever CI shard drew it.
  for (const locale of LOCALE_CODES) {
    test(`every ${locale} sitemap page is useful without JavaScript`, async ({ page, request }) => {
      // 14 page loads; the CJK locales take about twice as long as the rest on a busy runner.
      test.setTimeout(60_000);
      // The assertions read server-rendered markup only. Skipping fonts and images halves the
      // run, most of all for the CJK locales' large web fonts.
      await page.route("**/*", (route) =>
        ["font", "image", "media"].includes(route.request().resourceType()) &&
        new URL(route.request().url()).origin === new URL(page.url()).origin
          ? route.abort()
          : route.fallback(),
      );
      const allPaths = await sitemapPaths(request);
      const paths = allPaths.filter((path) => sitemapLocale(path) === locale);
      expect(paths.length).toBeGreaterThan(0);

      for (const path of paths) {
        const response = await page.goto(path);
        const expectedCanonicalUrl = new URL(path, SITE_ORIGIN).href;

        expect(response?.ok()).toBe(true);
        await expect(page).toHaveTitle(
          HOME_PATH_PATTERN.test(path) ? SITE_NAME : new RegExp(` — ${SITE_NAME}$`),
        );
        await expect(page).not.toHaveTitle(/tracker/i);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute(
          "content",
          /Fields of Mistria/,
        );
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          expectedCanonicalUrl,
        );
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
          "content",
          expectedCanonicalUrl,
        );
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
          "content",
          `${SITE_ORIGIN}/og-image.png`,
        );
        await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute(
          "content",
          "image/png",
        );
        await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
          "content",
          "1200",
        );
        await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
          "content",
          "630",
        );
        await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
          "content",
          `${SITE_ORIGIN}/og-image.png`,
        );
        await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
          "content",
          "Mistria Field Guide showing an Everything progress stripe at 27% completion.",
        );
        await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute(
          "content",
          "Mistria Field Guide showing an Everything progress stripe at 27% completion.",
        );
        await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      }
    });
  }

  test("Data management is rendered but excluded from indexing", async ({ page }) => {
    const response = await page.goto("/data");

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(`Data management — ${SITE_NAME}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Data management" })).toBeVisible();
  });
});
