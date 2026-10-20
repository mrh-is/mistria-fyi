// oxlint-disable playwright/no-raw-locators -- this geometry test measures decorative counts & ribbons without semantic roles
import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoRenderedApplication,
  initializeApplication,
} from "./support/application-state.js";
import { requireBox } from "./support/boxes.js";

test("home stripe counts fit before their ribbons", async ({ page }) => {
  await initializeApplication(
    page,
    "light",
    createStoredState({
      availabilityWindows: ["now", "anytime", "later"],
      progress: {
        renown: 100,
      },
      showSpoilers: true,
    }),
  );
  await gotoRenderedApplication(page, "/");
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ height: 800, width });
    for (const stripe of await page.locator("[data-category-stripe]").all()) {
      const ribbon = await requireBox(stripe.locator("[data-category-ribbon]"));
      const count = await requireBox(stripe.locator(".category-count"));
      const parts = stripe.locator(".category-count > span");
      for (const part of await parts.all()) {
        const box = await requireBox(part);
        expect(await part.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        expect(box.x + box.width).toBeLessThanOrEqual(count.x + count.width);
        expect(box.x + box.width).toBeLessThanOrEqual(ribbon.x);
      }
      await expect(stripe.locator(".category-count")).not.toHaveCSS("overflow", "hidden");
    }
  }
  await expect(page.getByRole("link", { name: /^Renown,/ })).toHaveClass(
    /category-stripe--complete/,
  );
  await expect(
    page.getByRole("link", { name: /^Almanac,/ }).locator(".category-count"),
  ).toContainText(/\d,\d{3}/);
});
