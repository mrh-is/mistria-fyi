import { expect, test } from "../browser/test.js";
import { gotoApplication, waitForRendering } from "./support/application-state.js";

for (const { entry, link, path } of [
  { entry: "About", link: "Privacy", path: "about" },
  { entry: "Data", link: "Privacy policy", path: "data" },
]) {
  test(`privacy returns through ${entry} to home`, async ({ page }, testInfo) => {
    await gotoApplication(page, "/en");
    await page.getByRole("button", { name: "Quick settings" }).click();
    await page.getByRole("link", { exact: true, name: entry }).click();
    await page.getByRole("link", { exact: true, name: link }).click();
    await expect(page).toHaveURL(new RegExp(`/en/privacy\\?from=${path}$`));
    await page.reload();

    if (path === "about") {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ height: 800, width });
        await page.emulateMedia({
          colorScheme: width === 1280 ? "light" : "dark",
          reducedMotion: "reduce",
        });
        await expect(page.getByRole("link", { exact: true, name: "Go back" })).toHaveAttribute(
          "href",
          "/en/about",
        );
        await page.screenshot({ path: testInfo.outputPath(`privacy-${width}.png`) });
      }
    }
    await page.getByRole("link", { exact: true, name: "Go back" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${path}$`));
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await waitForRendering(page);
  });
}

for (const query of ["", "?from=https://external.example"]) {
  test(`privacy links home without a recognized source (${query || "no query"})`, async ({
    page,
  }) => {
    await gotoApplication(page, `/en/privacy${query}`);
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await waitForRendering(page);
  });
}
