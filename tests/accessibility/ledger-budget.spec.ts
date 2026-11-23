import { devices, webkit } from "@playwright/test";

import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
  waitForRendering,
} from "./support/application-state.js";
import { analyzeAccessibility } from "./support/axe.js";
import { closeSearch, openSearch, scrollToSection, settleLayout } from "./support/scenarios.js";

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
  /** One axe scan of the visible Artifacts ledger, in milliseconds. */
  scanMs: number;
}

async function measureAlmanac(page: Page): Promise<Budget> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  await initializeApplication(page, "light", createStoredState());
  const started = Date.now();
  await gotoApplication(page, "/almanac");
  const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
  await expect(artifacts.getByRole("button", { name: /^Check /u }).first()).toBeVisible();
  const interactiveMs = Date.now() - started;
  await waitForRendering(page);
  await settleLayout(page);
  const { elements, rows } = await page.evaluate(() => ({
    elements: document.querySelectorAll("*").length,
    rows: document.querySelectorAll("[data-ledger-fact]").length,
  }));
  const scanStarted = Date.now();
  await analyzeAccessibility(page, {
    include: "#artifacts",
    route: "/almanac",
    state: "budget",
    theme: "light",
  });
  const scanMs = Date.now() - scanStarted;
  return { elements, interactiveMs, rows, scanMs };
}

test("the Almanac stays within its budget at 4× CPU throttling", async ({ page }) => {
  const measured = await measureAlmanac(page);
  test.info().annotations.push({ type: "budget", description: JSON.stringify(measured) });
  // Measured about 2,100 elements, 60 rows, 1 s to interactive, & a 1.3 s scan. Mounting every
  // row measured 35,407 elements & 1,879 rows on the same desktop window. Cap first-load
  // elements at 2,500, over 10× below the old whole-document element count.
  expect(measured.rows).toBeLessThanOrEqual(200);
  expect(measured.elements).toBeLessThanOrEqual(2500);
  expect(measured.interactiveMs).toBeLessThanOrEqual(10_000);
  expect(measured.scanMs).toBeLessThanOrEqual(10_000);
});

test("Almanac search finds an unmounted Furniture row at 4× CPU throttling", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  await page.setViewportSize({ height: 844, width: 390 });
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac");

  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const fold = furniture.getByRole("button", { exact: true, name: "Furniture" });
  const doormat = furniture.getByRole("button", { exact: true, name: "Check Basic Doormat" });
  const mountedRows = () =>
    furniture.evaluate((section) => section.querySelectorAll("[data-ledger-fact]").length);
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  expect(await mountedRows()).toBe(0);

  const started = Date.now();
  await openSearch(page, "Basic Doormat");
  await expect(doormat).toBeVisible();
  expect(Date.now() - started).toBeLessThanOrEqual(5000);

  await closeSearch(page);
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  expect(await mountedRows()).toBe(0);
});

test("the source ledger mounts no rows until a place opens", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/everything?group=source");
  // All 721 places start closed. Their heads & wrappers still mount about 11,300 elements (#716).
  // Keep the readiness floor near the full projection before inspecting mounted rows.
  // oxlint-disable-next-line playwright/no-raw-locators -- Place boxes have no role of their own.
  const places = page.locator("[data-source-section]");
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll("[data-source-section]").length))
    .toBeGreaterThanOrEqual(700);
  // oxlint-disable-next-line playwright/no-raw-locators -- Count row boxes across the page.
  const rows = page.locator("[data-ledger-fact]");
  await settleLayout(page);
  await expect(rows).toHaveCount(0);

  const place = places.first();
  await place.getByRole("button", { expanded: false }).first().click();
  // oxlint-disable-next-line playwright/no-raw-locators -- Count the opened place's row boxes.
  await expect.poll(() => place.locator("[data-ledger-fact]").count()).toBeGreaterThan(0);
});

test("a broad source search keeps the row budget", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/everything?group=source");
  await openSearch(page, "a");
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll("[data-ledger-fact]").length))
    .toBeGreaterThan(0);
  await settleLayout(page);
  const rows = await page.evaluate(() => document.querySelectorAll("[data-ledger-fact]").length);
  expect(rows).toBeLessThanOrEqual(200);
});

test("jumping into Furniture mounts rows near the landing point", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const rows = furniture.getByRole("button", { name: /^Check (?!spoilered item)/u });
  const first = (await rows.first().getAttribute("aria-label")) ?? "";
  expect(first).toMatch(/^Check /u);
  await furniture.evaluate((section) => {
    const shelf = section.querySelector('[data-shelf="todo"]');
    if (!shelf) throw new Error("Furniture To do shelf is missing.");
    const { height, top } = shelf.getBoundingClientRect();
    globalThis.scrollBy({ behavior: "instant", top: top + height * 0.7 });
  });
  await expect
    .poll(() =>
      furniture.evaluate((section) =>
        [...section.querySelectorAll("[data-ledger-row]")].some((row) => {
          const { bottom, top } = row.getBoundingClientRect();
          return bottom > 150 && top < globalThis.innerHeight;
        }),
      ),
    )
    .toBe(true);
  await expect(furniture.getByRole("button", { exact: true, name: first })).toHaveCount(0);
  expect(await rows.count()).toBeLessThanOrEqual(100);
});

test("a focused row stays mounted when the window scrolls past it", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const first = furniture.getByRole("button", { name: /^Check (?!spoilered item)/u }).first();
  await expect(first).toBeVisible();
  await first.focus();
  const label = (await first.getAttribute("aria-label")) ?? "";
  await furniture.evaluate((section) => {
    const shelf = section.querySelector('[data-shelf="todo"]');
    if (!shelf) throw new Error("Furniture To do shelf is missing.");
    const { height, top } = shelf.getBoundingClientRect();
    globalThis.scrollBy({ behavior: "instant", top: top + height * 0.7 });
  });
  // The window moves away from the first rows once it measures the new scroll position.
  await expect
    .poll(() =>
      furniture.evaluate(
        (section) => section.querySelector("[data-rows-before]")?.getAttribute("style") ?? "",
      ),
    )
    .not.toMatch(/--unmounted:\s*0\b/u);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")).toBe(
    label,
  );
});

/** Scroll Furniture 120 px at a time, down then up, and list each step the reading row drifted. */
async function scrollDrifts(page: Page): Promise<string[]> {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  // Start from the section after hydration. The deep-link tests cover initial hash alignment.
  await scrollToSection(furniture);
  await expect(furniture.getByRole("button", { name: /^Check /u }).first()).toBeVisible();
  await settleLayout(page);
  const found: string[] = [];
  for (const direction of [1, -1]) {
    for (let step = 0; step < 25; step += 1) {
      const before = await furniture.evaluate((section, distance) => {
        const row = [...section.querySelectorAll<HTMLElement>("[data-ledger-key]")].find(
          (candidate) => {
            const { bottom, top } = candidate.getBoundingClientRect();
            return top <= globalThis.innerHeight / 2 && bottom > globalThis.innerHeight / 2;
          },
        );
        if (!row) return undefined;
        const expected = row.getBoundingClientRect().top - distance;
        globalThis.scrollBy({ behavior: "instant", top: distance });
        return { expected, key: row.dataset.ledgerKey ?? "" };
      }, direction * 120);
      if (!before) throw new Error(`No Furniture row at mid-viewport on step ${String(step)}.`);
      // The window measures on the next frame, and its rows lay out on the one after.
      await page.evaluate(async () => {
        for (let frame = 0; frame < 3; frame += 1) {
          await new Promise((resolve) => {
            requestAnimationFrame(resolve);
          });
        }
      });
      const drift = await furniture.evaluate(
        (section, { expected, key }) =>
          (section.querySelector(`[data-ledger-key="${CSS.escape(key)}"]`)?.getBoundingClientRect()
            .top ?? Number.NaN) - expected,
        before,
      );
      // Scroll anchoring snaps to whole pixels, so a subpixel row can land 1 px off.
      if (!(Math.abs(drift) <= 1)) found.push(`${String(direction * step)}: ${String(drift)}`);
    }
  }
  return found;
}

test("scrolling through Furniture in small steps keeps the reading row in place", async ({
  page,
}) => {
  // Rows run taller than the spacers' estimate, so each window step used to move the page by the
  // difference: 9 to 153 px at this width (#717).
  expect(await scrollDrifts(page)).toEqual([]);
});

test("scrolling up through Furniture in WebKit keeps the reading row in place", async ({
  baseURL,
}) => {
  // WebKit's scroll anchoring didn't absorb rows growing on their first paint: up to 151 px a step.
  // It also launches its own browser, so it needs longer than one page's tests.
  test.setTimeout(120_000);
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({
      ...devices["Desktop Safari"],
      baseURL,
      locale: "en-US",
      serviceWorkers: "block",
      timezoneId: "UTC",
      viewport: { height: 720, width: 1280 },
    });
    expect(await scrollDrifts(await context.newPage())).toEqual([]);
  } finally {
    await browser.close();
  }
});

test("the next row control moves focus to the next unmounted entry", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const next = furniture.getByRole("button", { exact: true, name: "Next rows" }).first();
  await expect(furniture.getByRole("button", { name: /^Check /u }).first()).toBeVisible();
  await expect(next).toBeAttached();
  await next.press("Enter");
  await expect
    .poll(() =>
      furniture.evaluate((section) => {
        const focused = document.activeElement;
        if (!focused || !section.contains(focused)) return "";
        const { bottom, top } = focused.getBoundingClientRect();
        return top >= 0 && bottom <= globalThis.innerHeight
          ? focused.getAttribute("aria-label")
          : "";
      }),
    )
    .toMatch(/^Check /u);
});

test("closing a search result shelf returns focus to its section button", async ({ page }) => {
  await initializeApplication(
    page,
    "light",
    createStoredState({ progress: { almanac: ["clay_amphora"] } }),
  );
  await gotoApplication(page, "/almanac");
  await openSearch(page, "Clay Amphora");
  const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
  const result = artifacts.getByRole("button", { exact: true, name: "Artifacts" });
  await expect(result).toHaveAttribute("aria-expanded", "false");
  await result.press("Enter");
  // oxlint-disable-next-line playwright/no-raw-locators -- Chromium reports an open summary as a disclosure, not a button.
  const shelf = artifacts.locator("details[open] > summary").filter({ hasText: "Completed" });
  await expect(shelf).toBeVisible();
  await shelf.press("Space");
  await expect(result).toBeFocused();
});
