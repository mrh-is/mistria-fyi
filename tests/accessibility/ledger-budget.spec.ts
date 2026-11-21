import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
  waitForRendering,
} from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";
import { settleLayout } from "./support/scenarios.js";

import type { Page } from "@playwright/test";

/*
 * The ledgers mount rows near the screen, not all at once (#714). Mounting every row made axe,
 * Playwright, & screen readers walk the whole ledger, which stalled the accessibility CI (#708).
 * These budgets fail a change that mounts far more of a ledger again, at CI's 4× CPU throttling,
 * before it shows up as unrelated timeouts.
 */
const CPU_THROTTLE = 4;

interface Budget {
  /** Elements in the whole document, once the first screen's rows have mounted. */
  elements: number;
  /** Time from navigation to the first row's checkbox showing, in milliseconds. */
  interactiveMs: number;
  /** Ledger rows mounted. */
  rows: number;
  /** One whole-page axe scan, in milliseconds. */
  scanMs: number;
}

async function measure(page: Page, path: string, firstCheck: () => Promise<void>): Promise<Budget> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  await initializeApplication(page, "light", createStoredState());
  const started = Date.now();
  await gotoApplication(page, path);
  await firstCheck();
  const interactiveMs = Date.now() - started;
  await waitForRendering(page);
  await settleLayout(page);
  const { elements, rows } = await page.evaluate(() => ({
    elements: document.querySelectorAll("*").length,
    rows: document.querySelectorAll("[data-ledger-fact]").length,
  }));
  const scanStarted = Date.now();
  await analyzeAccessibility(page, { route: path, state: "budget", theme: "light" });
  const scanMs = Date.now() - scanStarted;
  return { elements, interactiveMs, rows, scanMs };
}

test("the Almanac stays within its budget at 4× CPU throttling", async ({ page }) => {
  const measured = await measure(page, "/almanac", async () => {
    const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
    await expect(artifacts.getByRole("button", { name: /^Check / }).first()).toBeVisible();
  });
  test.info().annotations.push({ type: "budget", description: JSON.stringify(measured) });
  // Measured about 2,100 elements, 60 rows, 1 s to interactive, & a 1.3 s scan. Mounting every
  // row measured 35,407 elements & 1,879 rows on the same desktop window.
  expect(measured.rows).toBeLessThanOrEqual(200);
  expect(measured.elements).toBeLessThanOrEqual(5000);
  expect(measured.interactiveMs).toBeLessThanOrEqual(10_000);
  expect(measured.scanMs).toBeLessThanOrEqual(10_000);
});

test("the source ledger mounts no rows until a place opens", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/everything?group=source");
  // Every place starts closed. Its heads alone still cost about 24,600 elements across 888 places,
  // which #716 tracks, so this test avoids page-wide role queries. Mounting every row as well
  // measured about 52,000.
  // oxlint-disable-next-line playwright/no-raw-locators -- Place boxes have no role of their own.
  const places = page.locator("[data-source-section]");
  await expect.poll(() => places.count()).toBeGreaterThan(800);
  // oxlint-disable-next-line playwright/no-raw-locators -- Count row boxes across the page.
  const rows = page.locator("[data-ledger-fact]");
  await settleLayout(page);
  await expect(rows).toHaveCount(0);

  const place = places.first();
  await place.getByRole("button", { expanded: false }).first().click();
  // oxlint-disable-next-line playwright/no-raw-locators -- Count the opened place's row boxes.
  await expect.poll(() => place.locator("[data-ledger-fact]").count()).toBeGreaterThan(0);
});
