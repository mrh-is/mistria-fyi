import { expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";
import { gotoApplication, HYDRATED_SELECTOR } from "./support/application-state.js";
import { criticalWhen } from "./support/tags.js";

const coreRoutes = new Set<string>(["/", "/almanac", "/villagers", "/all"]);

test.describe("route smoke", () => {
  for (const route of accessibilityRoutes) {
    test(
      `${route.name} renders its primary structure`,
      criticalWhen(coreRoutes.has(route.path)),
      async ({ page }) => {
        const response = await gotoApplication(page, route.path);

        expect(response?.ok()).toBe(true);
        await expect(page.locator(HYDRATED_SELECTOR)).toHaveCount(1);
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      },
    );
  }
});
