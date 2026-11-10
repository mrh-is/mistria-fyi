import { expect, test } from "../browser/test.js";
import { gotoApplication, initializeApplication } from "./support/application-state.js";
import { requireBox } from "./support/boxes.js";

import type { Locator } from "@playwright/test";

async function expectHoverOutline(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  const before = await requireBox(control);
  await expect(control).toHaveCSS("outline-style", "none");
  await control.hover();
  await expect(control).toHaveCSS("outline-style", "solid");
  await expect(control).toHaveCSS("outline-width", "2px");
  expect(await requireBox(control)).toEqual(before);
  await control.page().mouse.move(0, 0);
  await expect(control).toHaveCSS("outline-style", "none");
}

for (const theme of ["light", "dark"] as const) {
  test(`settings links and form controls respond to hover in ${theme} mode`, async ({ page }) => {
    await initializeApplication(page, theme);
    await gotoApplication(page, "/");

    const settings = page.getByRole("button", { name: "Quick settings" });
    await settings.click();
    const panel = page.getByRole("dialog", { name: "Quick settings" });
    for (const name of ["Data", "About"]) {
      const link = panel.getByRole("link", { exact: true, name });
      const restingColor = await link.evaluate((element) => getComputedStyle(element).color);
      await link.hover();
      await expect(link).not.toHaveCSS("color", restingColor);
      const hoverColor = await link.evaluate((element) => getComputedStyle(element).color);
      // oxlint-disable-next-line playwright/no-raw-locators -- decorative icons have no accessible role
      await expect(link.locator("svg").first()).toHaveCSS("color", hoverColor);
    }

    await expectHoverOutline(panel.getByRole("button", { name: "Choose language" }));
    await expectHoverOutline(panel.getByRole("switch", { name: "Show spoilers?" }));
    await panel.getByRole("button", { name: "Close Quick settings" }).click();
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "Send feedback" }).click();
    const feedback = page.getByRole("dialog", { name: "Send feedback" });
    for (const name of ["Attach progress", "Attach sync log", "Email me back"]) {
      await expectHoverOutline(feedback.getByRole("checkbox", { name }));
    }
  });

  test(`shelf info uses the page accent in ${theme} mode`, async ({ page }) => {
    await initializeApplication(page, theme);
    for (const [path, token] of [
      ["/", "--color-home-accent"],
      ["/almanac", "--color-category-almanac"],
    ] as const) {
      await gotoApplication(page, path);
      const info = page.getByRole("button", { name: /^About the .* shelf$/ }).first();
      await info.hover();
      const accent = await info.evaluate((element, property) => {
        const sample = document.createElement("span");
        sample.style.color = `var(${property})`;
        element.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      }, token);
      await expect(info).toHaveCSS("outline-width", "2px");
      await expect(info).toHaveCSS("outline-color", accent);
    }
  });
}
