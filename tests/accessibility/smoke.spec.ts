import { expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";

test.describe("@critical route smoke", () => {
  for (const route of accessibilityRoutes) {
    test(`${route.name} renders its primary structure`, async ({ page }) => {
      const response = await page.goto(route.path);

      expect(response?.ok()).toBe(true);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }
});
