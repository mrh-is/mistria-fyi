import { expect, test } from "../browser/test.js";
import { gotoApplication, initializeApplication } from "./support/application-state.js";
import { openSearch } from "./support/scenarios.js";

test("Everything survives client navigation from an active Almanac search", async ({ page }) => {
  await initializeApplication(page, "light");
  await gotoApplication(page, "/en/almanac");
  await openSearch(page, "a");
  await expect(page.getByRole("status").filter({ hasText: /\d+ results?/ })).toBeVisible();

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/en/everything";
    link.textContent = "Everything navigation regression";
    document.body.append(link);
  });
  await page.getByRole("link", { name: "Everything navigation regression" }).click();

  await expect(page).toHaveURL(/\/en\/everything$/);
  await expect(page.getByRole("heading", { level: 1, name: "Everything" })).toBeVisible();
  await expect(page.getByRole("button", { exact: true, name: "Almanac" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
