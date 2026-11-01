import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SATOSHI_PATH, verifySatoshi } from "../../scripts/playwright-satoshi.js";
import { visualCases } from "../../scripts/visual-diff.js";
import {
  createStoredState,
  expectResolvedTheme,
  gotoRenderedApplication,
  initializeApplication,
  waitForRendering,
} from "../accessibility/support/application-state.js";
import { expect, test } from "../browser/test.js";

// Both commits use this one harness, these local assets, & the same serialized state.
const state = createStoredState({ availabilityWindows: ["now", "anytime", "later"] });
for (const capture of visualCases) {
  test(capture.id, async ({ page }, testInfo) => {
    verifySatoshi(readFileSync(SATOSHI_PATH), SATOSHI_PATH);
    await page.setViewportSize({ height: 720, width: capture.width });
    await page.emulateMedia({ colorScheme: capture.theme, reducedMotion: "reduce" });
    await page.clock.setFixedTime(new Date("2026-01-15T12:00:00Z"));
    // The head serializes this state for both builds. A base build that can't load it (such as
    // after a storage schema bump) shows a persistence toast, which would otherwise read as a diff.
    // Record any toast from the first paint, since one could appear after a single DOM check.
    await page.addInitScript(() => {
      new MutationObserver((_records, observer) => {
        if (!document.querySelector("[data-sonner-toast]")) return;
        sessionStorage.setItem("visual-toast-seen", "true");
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await initializeApplication(page, capture.theme, state);
    await gotoRenderedApplication(page, capture.route === "home" ? "/en" : "/en/almanac");
    await expectResolvedTheme(page, capture.theme);
    if (capture.route === "almanac") {
      const artifacts = page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ });
      await artifacts.click();
      await expect(artifacts).toHaveAttribute("aria-expanded", "true");
      await waitForRendering(page);
    }
    expect(
      await page.evaluate(async () => {
        await document.fonts.load("1em Satoshi");
        return document.fonts.check("1em Satoshi");
      }),
      "Visual captures require the pinned Satoshi font",
    ).toBe(true);
    const image = await page.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
    // Checked after the capture, and before it's saved, so a toast in the image always fails.
    expect(
      await page.evaluate(() => sessionStorage.getItem("visual-toast-seen")),
      "Visual captures require the base build to load the shared state",
    ).toBeNull();
    const directory = join(".playwright-artifacts/visual", process.env.VISUAL_REVISION ?? "head");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${capture.id}-${testInfo.repeatEachIndex}.png`), image);
  });
}
