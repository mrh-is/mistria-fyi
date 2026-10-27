import { expect, test } from "../browser/test.js";
import { gotoApplication, initializeApplication } from "./support/application-state.js";
import { openSearch } from "./support/scenarios.js";

// Frames are held in this regression, so automatic failure captures cannot settle.
test.use({ screenshot: "off" });
test.beforeEach(async ({ page }) => {
  await initializeApplication(page, "light");
});

test("replacing a deeply scrolled home query shows the new first screenful", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await gotoApplication(page, "/");
  // A smaller scrollable query keeps setup independent of the full broad-query reveal time.
  await openSearch(page, "bed");
  // oxlint-disable-next-line playwright/no-raw-locators -- The busy list & scroll container have no distinct roles.
  const results = page.locator(".search-results__rows");
  await expect(results).toHaveAttribute("aria-busy", "false");
  // oxlint-disable-next-line playwright/no-raw-locators -- Exercise the route’s actual scroll container.
  const scroller = page.locator(".home-content");
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
  });
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000);

  // Hold the new reveal at its first screenful, so catching up later cannot hide a blank viewport.
  await page.evaluate(() => {
    globalThis.requestAnimationFrame = () => 0;
  });
  await page.getByRole("textbox", { name: "Search items" }).fill("e");
  await expect(results).toHaveAttribute("aria-busy", "true");
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  // oxlint-disable-next-line playwright/no-raw-locators -- A result wrapper has no role shared by its different row types.
  await expect(page.locator(".search-result").first()).toBeInViewport();
});
