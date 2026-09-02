import { expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";
import { initializeApplication } from "./support/application-state.js";
import {
  collectVisibleElementBoxes,
  collectVisibleTargets,
  findOverflow,
  findTargetSizeViolations,
} from "./support/geometry.js";
import { openSearch, openSettingsCard, openVisibilityPanel } from "./support/scenarios.js";

test.describe("@critical 320-pixel reflow", () => {
  test.use({ viewport: { height: 720, width: 320 } });

  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  for (const route of accessibilityRoutes) {
    test(`${route.path} has no horizontal overflow`, async ({ page }) => {
      await page.goto(route.path);
      const violations = findOverflow(await collectVisibleElementBoxes(page), 320);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }

  test("expanded controls and results reflow", async ({ page }) => {
    await page.goto("/");
    await openSearch(page, "turnip");
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await openVisibilityPanel(page);
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);

    await page.goto("/settings");
    await openSettingsCard(page, "Import from Save File");
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);
  });
});

test.describe("@critical interactive target geometry", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  test("visible home controls meet the 24-pixel size-or-spacing rule", async ({ page }) => {
    await page.goto("/");
    const violations = findTargetSizeViolations(await collectVisibleTargets(page));
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("high-frequency tracker controls retain 44-pixel targets", async ({ page }) => {
    await page.goto("/almanac");
    await page.getByRole("button", { name: /^Artifacts 0\/\d+$/ }).click();
    const controls = page.getByRole("button", { name: /^Check / }).first();
    const box = await controls.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});
