import { expect, test } from "../browser/test.js";
import { gotoApplication } from "./support/application-state.js";

for (const { entry, link, path } of [
  { entry: "About", link: "Privacy", path: "about" },
  { entry: "Data", link: "Privacy policy", path: "data" },
]) {
  test(`privacy returns through ${entry} to home`, async ({ page }) => {
    await gotoApplication(page, "/en");
    await page.getByRole("button", { name: "Quick settings" }).click();
    await page.getByRole("link", { exact: true, name: entry }).click();
    await page.getByRole("link", { exact: true, name: link }).click();
    await expect(page).toHaveURL(/\/en\/privacy$/);

    await page.getByRole("link", { exact: true, name: "Go back" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${path}$`));
    await page.getByRole("link", { name: "Go back" }).click();
    await expect(page).toHaveURL(/\/en$/);

    await page.goForward();
    await page.goForward();
    await expect(page).toHaveURL(/\/en\/privacy$/);
    await page.getByRole("link", { name: "Go back" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${path}$`));
  });
}

test("a direct privacy visit falls back to About", async ({ page }) => {
  await gotoApplication(page, "/en/privacy");
  await page.getByRole("link", { name: "Back to About" }).click();
  await expect(page).toHaveURL(/\/en\/about$/);
});
