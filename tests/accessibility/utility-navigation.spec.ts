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
      const outgoing = document.querySelector("main");
      const routeContainer = outgoing?.parentElement;
      if (!routeContainer) throw new Error("Missing route container");
      // The browser URL can change before the view transition mounts the new page.
      const observer = new MutationObserver(() => {
        const landmarks = [...routeContainer.querySelectorAll(":scope > main")];
        if (!landmarks.some((landmark) => landmark !== outgoing)) return;
        link.dataset.routeMount = landmarks.length === 1 ? "single" : "overlapping";
        observer.disconnect();
      });
      observer.observe(routeContainer, { childList: true });
    }, `/en/${route}`);
    await page.getByRole("link", { name: "Utility navigation test" }).click();
    // `toHaveURL` snapshots the whole Almanac's accessibility tree on each miss, stalling the turn.
    await page.waitForURL(new RegExp(`/en/${route}$`));
    await expect(page.getByRole("link", { name: "Utility navigation test" })).toHaveAttribute(
      "data-route-mount",
      "single",
    );
    await page.getByRole("link", { exact: true, name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/en$/);
  });
}
