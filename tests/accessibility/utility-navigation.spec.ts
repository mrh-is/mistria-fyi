import { expect, test } from "../browser/test.js";
import { gotoApplication, initializeApplication } from "./support/application-state.js";

// Keep the navigation timeline without serializing the Almanac DOM on every action.
test.use({
  trace: {
    mode: process.env.CI === "true" ? "on-first-retry" : "retain-on-failure",
    snapshots: false,
  },
});

for (const route of ["about", "data", "sync"]) {
  test(`${route} back arrow stays in the guide after external entry`, async ({
    page,
  }, testInfo) => {
    await initializeApplication(page, "system");
    await page.goto("data:text/html,<title>External page</title>");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await gotoApplication(page, `/en/${route}`);
    const back = page.getByRole("link", { exact: true, name: "Back to home" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ height: 800, width });
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
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
    await back.click();
    await expect(page).toHaveURL(/\/en$/);
    expect(errors).toEqual([]);
  });

  test(`${route} back arrow links home after in-app navigation`, async ({ page }) => {
    await initializeApplication(page, "light");
    await gotoApplication(page, "/en/almanac");
    // Use a real client-side link without coupling this journey to toolbar panel controls.
    await page.evaluate((href) => {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = "Utility navigation test";
      document.body.append(link);
      const observer = new MutationObserver(() => {
        const landmarks = document.querySelectorAll("main");
        if (landmarks.length > 1) link.dataset.duplicateMain = "true";
      });
      const routeContainer = document.querySelector("main")?.parentElement;
      if (!routeContainer) throw new Error("Missing route container");
      observer.observe(routeContainer, { childList: true });
    }, `/en/${route}`);
    await page.getByRole("link", { name: "Utility navigation test" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${route}$`));
    await expect(page.getByRole("link", { name: "Utility navigation test" })).not.toHaveAttribute(
      "data-duplicate-main",
      "true",
    );
    await page.getByRole("link", { exact: true, name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/en$/);
  });
}
