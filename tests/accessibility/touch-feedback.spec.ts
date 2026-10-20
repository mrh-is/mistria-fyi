import { PROGRESS_STORAGE_KEY } from "../../src/lib/stores/storage-keys.js";
import { expect, test } from "../browser/test.js";
import {
  gotoRenderedApplication,
  initializeApplication,
  waitForRendering,
} from "./support/application-state.js";
import { requireBox } from "./support/boxes.js";

import type { Locator, Page } from "@playwright/test";

function readFeedback(element: Element): string {
  const style = getComputedStyle(element);
  return [style.backgroundColor, style.outlineColor, style.outlineWidth, style.transform].join(";");
}

function feedback(target: Locator): Promise<string> {
  return target.evaluate(readFeedback);
}

async function scrollFromControl(page: Page, target: Locator, paint = target): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await waitForRendering(page);
  const stableTarget = await target.elementHandle();
  const stablePaint = await paint.elementHandle();
  const original = await stablePaint.evaluate(readFeedback);
  const originalState = await stableTarget.evaluate((element) => ({
    checked: element.getAttribute("aria-checked"),
    className: element.getAttribute("class"),
    expanded: element.getAttribute("aria-expanded"),
    label: element.getAttribute("aria-label"),
    text: element.textContent,
  }));
  const originalUrl = page.url();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), PROGRESS_STORAGE_KEY))
    .not.toBe(null);
  const originalProgress = await page.evaluate(
    (key) => localStorage.getItem(key),
    PROGRESS_STORAGE_KEY,
  );
  const originalScroll = await page.evaluate(() => scrollY);
  const box = await requireBox(target);
  const client = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: Math.max(1, y - 120) }],
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(originalScroll);
  await expect.poll(() => stablePaint.evaluate(readFeedback)).toBe(original);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => stablePaint.evaluate(readFeedback)).toBe(original);
  expect(await stableTarget.evaluate((element) => element.isConnected)).toBe(true);
  expect(
    await stableTarget.evaluate((element) => ({
      checked: element.getAttribute("aria-checked"),
      className: element.getAttribute("class"),
      expanded: element.getAttribute("aria-expanded"),
      label: element.getAttribute("aria-label"),
      text: element.textContent,
    })),
  ).toEqual(originalState);
  await expect(page).toHaveURL(originalUrl);
  expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_STORAGE_KEY)).toBe(
    originalProgress,
  );
  await client.detach();
}

test.describe("touch feedback", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { height: 800, width: 390 } });

  for (const theme of ["light", "dark"] as const) {
    test(`${theme} scroll gestures clear row, section, & stripe feedback`, async ({ page }) => {
      await initializeApplication(page, theme);
      await gotoRenderedApplication(page, "/");
      await scrollFromControl(page, page.getByRole("link", { name: /^Almanac,/ }));
      await gotoRenderedApplication(page, "/almanac");
      const section = page.getByRole("button", { name: /^Artifacts,/ });
      await section.tap();
      await waitForRendering(page);
      await scrollFromControl(page, section);
      const original = await feedback(section);
      await section.tap();
      await expect(section).toHaveAttribute("aria-expanded", "false");
      await expect.poll(() => feedback(section)).toBe(original);
      const box = await requireBox(section);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect.poll(() => feedback(section)).not.toBe(original);
      await page.mouse.up();
      await expect(section).toHaveAttribute("aria-expanded", "true");
      await expect.poll(() => feedback(section)).toBe(original);
      await waitForRendering(page);
      await scrollFromControl(page, page.getByRole("button", { name: /^Check / }).first());
      await page.setViewportSize({ height: 500, width: 390 });
      await gotoRenderedApplication(page, "/mines");
      const spoiler = page.getByRole("button", { name: "Reveal spoiler" }).first();
      const mask = spoiler.getByTestId("spoiler-cover-mask");
      await scrollFromControl(page, spoiler, mask);
      await spoiler.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const originalMask = await feedback(mask);
      await spoiler.hover();
      await expect.poll(() => feedback(mask)).toBe(originalMask);
      await page.mouse.down();
      await expect.poll(() => feedback(mask)).not.toBe(originalMask);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await expect.poll(() => feedback(mask)).toBe(originalMask);
    });
  }
});

test("mouse hover & keyboard focus retain row feedback", async ({ page }) => {
  await initializeApplication(page, "light");
  await gotoRenderedApplication(page, "/almanac");
  const section = page.getByRole("button", { name: /^Artifacts,/ });
  const original = await feedback(section);
  await section.hover();
  await expect.poll(() => feedback(section)).not.toBe(original);
  await page.mouse.move(0, 0);
  await expect.poll(() => feedback(section)).toBe(original);
  await page.keyboard.press("Tab");
  await section.focus();
  await expect(section).toBeFocused();
  await expect(section).toHaveCSS("outline-style", "solid");
  await expect(section).toHaveCSS("outline-width", "2px");
});
