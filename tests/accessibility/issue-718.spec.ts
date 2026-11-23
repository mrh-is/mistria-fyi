import { expect, test } from "../browser/test.js";
import { gotoApplication, initializeApplication } from "./support/application-state.js";
import { openSearch } from "./support/scenarios.js";

test("Everything survives client navigation from an active Almanac search", async ({ page }) => {
  await initializeApplication(page, "light");
  await gotoApplication(page, "/en/almanac#furniture");
  await openSearch(page, "a");
  await expect(page.getByRole("status").filter({ hasText: /\d+ results?/ })).toBeVisible();

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("navigation", { name: "Thumb index" })
    .getByRole("link", { exact: true, name: "Everything" })
    .click();

  await expect(page).toHaveURL(/\/en\/everything$/);
  await expect(page.getByRole("heading", { level: 1, name: "Everything" })).toBeVisible();
  await expect(page.getByRole("region", { exact: true, name: "Almanac" })).toBeVisible();
  expect(errors).toEqual([]);
});
