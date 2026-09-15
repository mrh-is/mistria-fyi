import { expect, test } from "@playwright/test";

import { INDEXABLE_PAGE_PATHS, resolvePageMetadata } from "../../src/lib/data/page-metadata.js";

test.use({ javaScriptEnabled: false });

test.describe("server-rendered search metadata", () => {
  for (const path of INDEXABLE_PAGE_PATHS) {
    test(`${path} is useful without JavaScript`, async ({ page }) => {
      const metadata = resolvePageMetadata(path, 200);
      const response = await page.goto(path);

      expect(response?.ok()).toBe(true);
      await expect(page).toHaveTitle(metadata.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        metadata.description,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        metadata.canonicalUrl,
      );
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
        "content",
        metadata.canonicalUrl,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }

  test("Data management is rendered but excluded from indexing", async ({ page }) => {
    const metadata = resolvePageMetadata("/data", 200);
    const response = await page.goto("/data");

    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(metadata.title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Data management" })).toBeVisible();
  });
});
