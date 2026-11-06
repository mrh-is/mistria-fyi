import { PROGRESS_STORAGE_KEY } from "../../src/lib/stores/storage-keys.js";
import { THEME_STORAGE_KEY } from "../../src/lib/theme.js";
import { expect, test } from "../browser/test.js";
import { gotoApplication, waitForRendering } from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";

for (const [theme, width] of [
  ["light", 1280],
  ["dark", 390],
] as const) {
  test(`${theme} first check-off requires a lane and offers a safe installation transfer`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ height: 844, width });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ preference, themeKey }) => {
        localStorage.setItem(themeKey, preference);
        Object.defineProperty(navigator, "userAgent", {
          configurable: true,
          value: "iPhone Safari",
        });
        Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
        Object.defineProperty(navigator, "storage", {
          configurable: true,
          value: { persist: () => Promise.resolve(false) },
        });
      },
      { preference: theme, themeKey: THEME_STORAGE_KEY },
    );
    await gotoApplication(page, "/");
    await expect(page.getByRole("heading", { name: "Ready to get started?" })).toBeVisible();
    await waitForRendering(page);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`) });
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of/ }).click();
    const first = page.getByRole("button", { name: /^Check (?!spoilered item)/ }).first();
    const name = await first.getAttribute("aria-label");
    expect(name).toBeTruthy();
    await first.click();
    const chooser = page.getByRole("dialog", { name: "How do you wanna track your farm?" });
    await expect(chooser).toBeVisible();
    await analyzeAccessibility(page, { route: "/almanac", state: "lane-choice", theme }, testInfo);
    await waitForRendering(page);
    await page.screenshot({ path: testInfo.outputPath(`chooser-${width}.png`) });
    await chooser.getByRole("button", { exact: true, name: "Close" }).click();
    await expect(chooser).toBeHidden();
    await expect(page.getByRole("button", { exact: true, name: name ?? "" })).toBeVisible();
    await first.click();
    await chooser.getByRole("button", { name: /I’ll track it all by hand/ }).click();
    const install = page.getByRole("dialog", { name: "Let’s keep your progress safe" });
    await expect(install).toBeVisible();
    await analyzeAccessibility(
      page,
      { route: "/almanac", state: "install-guidance", theme },
      testInfo,
    );
    await waitForRendering(page);
    await page.screenshot({ path: testInfo.outputPath(`install-${width}.png`) });
    const download = page.waitForEvent("download");
    await install.getByRole("button", { name: "Export backup" }).click();
    const downloaded = await download;
    expect(downloaded.suggestedFilename()).toMatch(/^mistria-field-guide-backup-/);
    await install.getByRole("button", { name: "I’ve installed it" }).click();
    await expect(install).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const stored = JSON.parse(localStorage.getItem(key) ?? "null") as null | {
            local?: { reminders?: { install?: { dismissed?: boolean } }; trackingLane?: string };
            progress?: { almanac?: string[] };
          };
          return {
            count: stored?.progress?.almanac?.length ?? 0,
            dismissed: stored?.local?.reminders?.install?.dismissed,
            lane: stored?.local?.trackingLane,
          };
        }, PROGRESS_STORAGE_KEY),
      )
      .toMatchObject({ count: 1, dismissed: true, lane: "manual" });
    await page.reload();
    await expect(install).toBeHidden();
    expect(errors).toEqual([]);
  });

  test(`${theme} sync setup can choose tracking by hand`, async ({ page }, testInfo) => {
    await page.setViewportSize({ height: 844, width });
    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: THEME_STORAGE_KEY, value: theme },
    );
    await gotoApplication(page, "/sync");
    await waitForRendering(page);
    await page.screenshot({ path: testInfo.outputPath(`sync-${width}.png`) });
    await page.getByRole("button", { name: /track.*by hand/i }).click();
    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page.getByRole("heading", { name: "Ready to get started?" })).toBeHidden();
  });
}
