import { expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";
import { gotoApplication, HYDRATED_SELECTOR } from "./support/application-state.js";

test.describe("@critical route smoke", () => {
  for (const route of accessibilityRoutes) {
    test(`${route.name} renders its primary structure`, async ({ page }) => {
      const response = await gotoApplication(page, route.path);

      expect(response?.ok()).toBe(true);
      await expect(page.locator(HYDRATED_SELECTOR)).toHaveCount(1);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }
});
