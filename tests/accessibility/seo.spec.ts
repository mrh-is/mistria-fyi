import { expect, test } from "@playwright/test";

import { SITE_NAME, SITE_ORIGIN } from "../../src/lib/data/page-metadata.js";

test.use({ javaScriptEnabled: false });

test.describe("server-rendered search metadata", () => {
  test("the former NPCs route is not redirected", async ({ page }) => {
    const response = await page.goto("/npcs");

    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(/\/npcs$/);
  });

  test("every sitemap page is useful without JavaScript", async ({ page, request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
      ([, location]) => new URL(location).pathname,
    );

    for (const path of paths) {
      const response = await page.goto(path);
      const expectedCanonicalUrl = new URL(path, SITE_ORIGIN).href;

      expect(response?.ok()).toBe(true);
      await expect(page).toHaveTitle(path === "/" ? SITE_NAME : new RegExp(` — ${SITE_NAME}$`));
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

  test("Data management is rendered but excluded from indexing", async ({ page }) => {
    const response = await page.goto("/data");

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(`Data management — ${SITE_NAME}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Data management" })).toBeVisible();
  });
});
