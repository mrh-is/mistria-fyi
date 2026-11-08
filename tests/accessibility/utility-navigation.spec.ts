import { expect, test } from "../browser/test.js";
import { gotoApplication, initializeApplication } from "./support/application-state.js";

for (const route of ["about", "data", "sync"]) {
  test(`${route} back arrow stays in the guide after external entry`, async ({
    page,
  }, testInfo) => {
    await initializeApplication(page, "system");
    await page.goto("data:text/html,<title>External page</title>");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await gotoApplication(page, `/en/${route}`);
    const back = page.getByRole("link", { exact: true, name: "Go back" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ height: 800, width });
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(back).toBeVisible();
        if (
          (width === 1280 && colorScheme === "light") ||
          (width === 390 && colorScheme === "dark")
        ) {
          await page.screenshot({
            path: testInfo.outputPath(`${route}-${width}-${colorScheme}.png`),
          });
        }
      }
    }
    // Replacing the entry must not create a preceding app entry.
    await page.evaluate(() => {
      history.replaceState(history.state, "");
    });
    await back.click();
    await expect(page).toHaveURL(/\/en$/);
    expect(errors).toEqual([]);

    // Returning to the original entry must still use home, even with forward history present.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/en/${route}$`));
    await back.click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test(`${route} back arrow returns to the previous app page`, async ({ page }) => {
    await initializeApplication(page, "light");
    await gotoApplication(page, "/en/almanac");
    // Use a real client-side link without coupling this journey to toolbar panel controls.
    await page.evaluate((href) => {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = "Utility navigation test";
      document.body.append(link);
    }, `/en/${route}`);
    await page.getByRole("link", { name: "Utility navigation test" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${route}$`));
    await page.getByRole("link", { exact: true, name: "Go back" }).click();
    await expect(page).toHaveURL(/\/en\/almanac$/);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/en/${route}$`));
    await page.getByRole("link", { exact: true, name: "Go back" }).click();
    await expect(page).toHaveURL(/\/en\/almanac$/);
  });
}
