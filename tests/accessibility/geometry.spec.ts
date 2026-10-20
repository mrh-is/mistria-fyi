import { devices } from "@playwright/test";
import { existsSync } from "node:fs";

import { SATOSHI_PATH } from "../../scripts/playwright-satoshi.js";
import { expect, test } from "../browser/test.js";
import { accessibilityRoutes } from "./routes.js";
import {
  createStoredState,
  gotoRenderedApplication as gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { requireBox, settledBox } from "./support/boxes.js";
import {
  collectVisibleElementBoxes,
  collectVisibleTargets,
  findOverflow,
  findTargetSizeViolations,
} from "./support/geometry.js";
import { openSearch, openSettingsCard, openVisibilityPanel } from "./support/scenarios.js";
import { critical, criticalWhen } from "./support/tags.js";

// Geometry proves the production layout only with Satoshi's metrics. CI fetches the font
// (scripts/playwright-satoshi.ts); a local run without it measures fallback fonts.
test("measures layout with the production annotation font", async ({ page }) => {
  if (!existsSync(SATOSHI_PATH) && process.env.CI !== "true") {
    test.info().annotations.push({
      type: "warning",
      description: `Satoshi is missing at ${SATOSHI_PATH}; geometry measures fallback fonts.`,
    });
    test.skip(true, "Satoshi is not available locally");
  }
  await initializeApplication(page, "light");
  await gotoApplication(page, "/");
  const loaded = await page.evaluate(async () => {
    // An aborted font request rejects `load`; `check` then reports the failure.
    await document.fonts.load("1em Satoshi").catch(() => []);
    return document.fonts.check("1em Satoshi");
  });
  expect(loaded, "Satoshi failed to load; run pnpm exec tsx scripts/playwright-satoshi.ts").toBe(
    true,
  );
});

test.describe("320-pixel reflow", () => {
  test.use({ viewport: { height: 720, width: 320 } });

  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  for (const route of accessibilityRoutes) {
    test(
      `${route.path} has no horizontal overflow`,
      criticalWhen(route.path === "/"),
      async ({ page }) => {
        await gotoApplication(page, route.path);
        const violations = findOverflow(await collectVisibleElementBoxes(page), 320);
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      },
    );
  }

  test("expanded controls and results reflow", critical, async ({ page }) => {
    await gotoApplication(page, "/");
    await openSearch(page, "turnip");
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await openVisibilityPanel(page);
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);

    await gotoApplication(page, "/data");
    await openSettingsCard(page, "Import from Save File");
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);
  });

  test("populated specialized records reflow without horizontal overflow", async ({ page }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({
        availabilityWindows: ["now", "anytime", "later"],
        progress: {
          heartLevels: { adeline: 10 },
          mineFloor: 21,
          renown: 14,
          skillLevels: { mining: 22 },
          spells: [],
          villagerRelationships: { adeline: "romantic" },
        },
        showSpoilers: true,
      }),
    );

    for (const path of ["/villagers", "/skills", "/mines", "/renown", "/everything"]) {
      await gotoApplication(page, path);
      expect(findOverflow(await collectVisibleElementBoxes(page), 320), path).toEqual([]);
    }
  });

  test("category headings leave room for display-font descenders", async ({ page }) => {
    await gotoApplication(page, "/recipes");
    const metrics = await page.getByTestId("page-header-title").evaluate((heading) => {
      const style = getComputedStyle(heading);
      return {
        // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed style values carry a "px" suffix that Number() rejects
        fontSize: Number.parseFloat(style.fontSize),
        // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed style values carry a "px" suffix that Number() rejects
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });

    expect(metrics.lineHeight).toBeGreaterThan(metrics.fontSize);
  });
});

test.describe("interactive target geometry", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  test(
    "visible home controls meet the 24-pixel size-or-spacing rule",
    critical,
    async ({ page }) => {
      await gotoApplication(page, "/");
      const violations = findTargetSizeViolations(await collectVisibleTargets(page));
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    },
  );

  test("home category ribbons stay inside the viewport at 320 pixels", async ({ page }) => {
    await page.setViewportSize({ height: 720, width: 320 });
    await gotoApplication(page, "/");
    await expect(page.locator("[data-category-ribbon]").first()).toBeVisible();
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);
  });

  test("compact mine floor controls keep the readout between their buttons", async ({ page }) => {
    await gotoApplication(page, "/everything");
    const record = page.locator("[data-mine-floor-record][data-compact='true']");
    for (const width of [360, 390, 450, 1280]) {
      await page.setViewportSize({ height: 800, width });
      await record.scrollIntoViewIfNeeded();
      const decrement = await requireBox(record.getByRole("button").first());
      const increment = await requireBox(record.getByRole("button").last());
      for (const part of await record.locator(".floor-readout > *").all()) {
        const box = await requireBox(part);
        expect(box.x, `readout start at ${width}px`).toBeGreaterThanOrEqual(
          decrement.x + decrement.width,
        );
        expect(box.x + box.width, `readout end at ${width}px`).toBeLessThanOrEqual(increment.x);
      }
    }
  });

  test("fine-pointer tracker controls retain compact accessible targets", async ({ page }) => {
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
    expect(
      await page.evaluate(() => matchMedia("(pointer: fine) and (hover: hover)").matches),
    ).toBe(true);
    const row = page.locator("[data-tracker-row]").first();
    const responsiveSizes = await row.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        row: styles.getPropertyValue("--tracker-row-min-size"),
        sprite: styles.getPropertyValue("--tracker-sprite-size"),
        target: styles.getPropertyValue("--tracker-target-size"),
      };
    });
    expect(responsiveSizes).toEqual({ row: "40px", sprite: "36px", target: "32px" });

    const control = row.getByRole("button", { name: /^Check / });
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBe(32);
    expect(box?.height).toBe(32);
  });
});

test.describe("tracker paper geometry", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await initializeApplication(page, "light");
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
  });

  test(
    "source control and paper borders preserve the two-sheet geometry",
    critical,
    async ({ page }) => {
      const row = page
        .locator("[data-tracker-row]")
        .filter({ has: page.locator('button[aria-controls^="sources-"]') })
        .first();
      const nextRow = row.locator("xpath=following-sibling::*[@data-tracker-row][1]");
      const sourceButton = row.locator("button[aria-controls]");
      const sourcePaper = row.locator("[data-source-paper]");
      const whitePaper = row.getByTestId("tracker-paper-surface");
      const nextWhitePaper = nextRow.getByTestId("tracker-paper-surface");
      const diagonal = row.locator("[data-tracker-paper-diagonal] path");

      await expect(row).toBeVisible();
      await expect(nextRow).toBeVisible();
      const before = await requireBox(sourceButton);
      expect(before.width).toBeGreaterThanOrEqual(32);
      expect(before.height).toBeGreaterThanOrEqual(32);

      const hitTargetIsControl = await sourceButton.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const points = [
          [box.left + 2, box.top + 2],
          [box.right - 2, box.top + 2],
          [box.left + 2, box.bottom - 2],
          [box.right - 2, box.bottom - 2],
        ];
        return points.every(
          ([x, y]) => document.elementFromPoint(x, y)?.closest("button") === button,
        );
      });
      expect(hitTargetIsControl).toBe(true);

      expect(
        await whitePaper.evaluate((element) => getComputedStyle(element).borderBottomWidth),
      ).toBe("1px");
      expect(
        await nextWhitePaper.evaluate((element) => getComputedStyle(element).borderTopWidth),
      ).toBe("0px");
      expect(
        await sourcePaper.evaluate((element) => getComputedStyle(element).borderBottomWidth),
      ).toBe("1px");
      expect(await diagonal.evaluate((element) => getComputedStyle(element).strokeWidth)).toBe(
        "1px",
      );

      await sourceButton.click();
      await expect(row).toHaveAttribute("data-source-state", "open");
      await expect(row.getByTestId("source-card")).toBeVisible();
      const after = await settledBox(sourceButton);
      expect(Math.abs(after.x + after.width - (before.x + before.width))).toBeLessThanOrEqual(0.5);
      expect(after.y).toBeGreaterThan(before.y);
      const stationaryControl = row.locator("[data-source-paper-stationary-control]");
      const stationary = await settledBox(stationaryControl);
      expect(Math.abs(stationary.x - before.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(stationary.y - before.y)).toBeLessThanOrEqual(0.5);
      expect(
        await whitePaper.evaluate((element) => getComputedStyle(element).borderBottomWidth),
      ).toBe("1px");
      expect(
        await nextWhitePaper.evaluate((element) => getComputedStyle(element).borderTopWidth),
      ).toBe("1px");

      const gap = await row.evaluate((element) => {
        const source = element.querySelector<HTMLElement>("[data-source-paper]");
        const next = element.nextElementSibling?.querySelector<HTMLElement>(
          '[data-testid="tracker-paper-surface"]',
        );
        if (!source || !next) return null;
        return next.getBoundingClientRect().top - source.getBoundingClientRect().bottom;
      });
      if (gap === null) throw new Error("Expected the open source paper and a following row");
      expect(Math.abs(gap - 6)).toBeLessThanOrEqual(0.5);

      await stationaryControl.click({ position: { x: 2, y: 2 } });
      await expect(row).toHaveAttribute("data-source-state", "closed");
      const closedAgain = await settledBox(sourceButton);
      expect(Math.abs(closedAgain.y - before.y)).toBeLessThanOrEqual(0.5);
    },
  );
});

test.describe("tracker paper touch geometry", () => {
  test.use({
    deviceScaleFactor: devices["iPhone 13"].deviceScaleFactor,
    hasTouch: devices["iPhone 13"].hasTouch,
    isMobile: devices["iPhone 13"].isMobile,
    userAgent: devices["iPhone 13"].userAgent,
    viewport: { height: 720, width: 320 },
  });

  test("coarse-pointer targets and expanded sources fit at 320 pixels", async ({ page }) => {
    await initializeApplication(page, "light");
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();

    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    expect(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches)).toBe(true);
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);

    const row = page
      .locator("[data-tracker-row]")
      .filter({ has: page.locator('button[aria-controls^="sources-"]') })
      .first();
    const checkbox = row.getByRole("button", { name: /^Check / });
    const sourceButton = row.locator("button[aria-controls]");
    for (const control of [checkbox, sourceButton]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await sourceButton.click();
    await expect(row).toHaveAttribute("data-source-state", "open");
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);
  });

  test("spoiler covers stay text-height while their targets reach 44 pixels", async ({ page }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({ availabilityWindows: ["now", "anytime", "later"] }),
    );
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
    await page.getByRole("button", { name: /Show \d+ more/ }).click();

    await expect(page.getByRole("button", { name: "Reveal spoiler" }).first()).toBeVisible();
    // Long names wrap at 320 pixels; measure a cover that fits on one line.
    const singleLineIndex = await page
      .getByTestId("spoiler-cover-mask")
      .evaluateAll((masks) => masks.findIndex((mask) => mask.getBoundingClientRect().height <= 24));
    expect(singleLineIndex).toBeGreaterThanOrEqual(0);
    const spoiler = page.getByRole("button", { name: "Reveal spoiler" }).nth(singleLineIndex);
    const rowIndex = await spoiler.evaluate((element) => {
      const rows = [...document.querySelectorAll("[data-tracker-row]")];
      return rows.findIndex((candidate) => candidate.contains(element));
    });
    const row = page.locator("[data-tracker-row]").nth(rowIndex);
    await spoiler.scrollIntoViewIfNeeded();
    const rowBefore = await requireBox(row);
    const button = await requireBox(spoiler);
    const cover = await requireBox(spoiler.getByTestId("spoiler-cover-mask"));
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(cover.height).toBeLessThanOrEqual(24);
    expect(rowBefore.height).toBeLessThan(60);

    await page.mouse.click(cover.x + 8, cover.y - 6);
    await expect(row.getByRole("button", { name: "Reveal spoiler" })).toHaveCount(0);
    const rowAfter = await settledBox(row);
    expect(Math.abs(rowAfter.height - rowBefore.height)).toBeLessThanOrEqual(0.5);
  });

  test("specialized record controls retain 44-pixel coarse targets", async ({ page }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({
        availabilityWindows: ["now", "anytime", "later"],
        progress: {
          heartLevels: { adeline: 10 },
          villagerRelationships: { adeline: "romantic" },
        },
        showSpoilers: true,
      }),
    );

    await gotoApplication(page, "/villagers");
    for (const control of await page
      .locator(
        "#villager-adeline [data-stepper-button], #villager-adeline [data-relationship-action]",
      )
      .all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const index = page.getByRole("navigation", { name: "Villager alphabet" });
    const beforeScroll = await requireBox(index);
    const roster = await requireBox(page.getByTestId("villager-roster"));
    const whitespaceCenter = (roster.x + roster.width + 320) / 2;
    expect(Math.abs(beforeScroll.x + beforeScroll.width / 2 - whitespaceCenter)).toBe(0);
    const indexGeometry = await index.evaluate((element) => {
      const style = getComputedStyle(element);
      const buttons = [...element.querySelectorAll("button")];
      return {
        buttonHeights: buttons.map((button) => button.getBoundingClientRect().height),
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
        position: style.position,
        scrollHeight: element.scrollHeight,
      };
    });
    expect(indexGeometry.position).toBe("fixed");
    expect(indexGeometry.overflowY).not.toMatch(/auto|scroll/);
    expect(indexGeometry.scrollHeight).toBe(indexGeometry.clientHeight);
    expect(Math.max(...indexGeometry.buttonHeights)).toBeLessThanOrEqual(24);

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    const afterScroll = await settledBox(index);
    expect(Math.abs(afterScroll.y - beforeScroll.y)).toBeLessThanOrEqual(0.5);
    expect(afterScroll.y).toBeGreaterThanOrEqual(62);
    expect(afterScroll.y + afterScroll.height).toBeLessThanOrEqual(652);

    await gotoApplication(page, "/skills");
    for (const control of await page.locator("[data-skill-record] button").first().all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await gotoApplication(page, "/mines");
    for (const control of await page
      .locator("[data-mine-floor-record] button, [data-mine-floor-record] input")
      .all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await gotoApplication(page, "/renown");
    for (const control of await page
      .locator("[data-renown-current] button, [data-renown-current] input")
      .all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("landscape phone width", () => {
  const landscape = devices["iPhone 13 landscape"];
  test.use({
    deviceScaleFactor: landscape.deviceScaleFactor,
    hasTouch: landscape.hasTouch,
    isMobile: landscape.isMobile,
    userAgent: landscape.userAgent,
    viewport: { height: 390, width: 844 },
  });

  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  for (const path of ["/", "/villagers"]) {
    test(`${path} spans the full width without overflow`, async ({ page }) => {
      await gotoApplication(page, path);
      const main = await requireBox(page.locator("#main-content"));
      expect(main.x).toBe(0);
      expect(main.width).toBe(844);
      expect(findOverflow(await collectVisibleElementBoxes(page), 844)).toEqual([]);
    });
  }

  test("the villager index stays in the full-width roster's margin", async ({ page }) => {
    await gotoApplication(page, "/villagers");
    const index = await requireBox(page.getByRole("navigation", { name: "Villager alphabet" }));
    const roster = await requireBox(page.getByTestId("villager-roster"));
    const whitespaceCenter = (roster.x + roster.width + 844) / 2;
    expect(Math.abs(index.x + index.width / 2 - whitespaceCenter)).toBeLessThanOrEqual(0.5);
  });

  test("a desktop window keeps the narrow column", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 1280 });
    await gotoApplication(page, "/");
    const main = await requireBox(page.locator("#main-content"));
    expect(main.width).toBe(512);
  });
});
