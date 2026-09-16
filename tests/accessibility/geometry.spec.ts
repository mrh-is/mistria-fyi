import { devices, expect, test } from "@playwright/test";

import { accessibilityRoutes } from "./routes.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
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
      await gotoApplication(page, route.path);
      const violations = findOverflow(await collectVisibleElementBoxes(page), 320);
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }

  test("expanded controls and results reflow", async ({ page }) => {
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
        availabilityMode: "everything",
        completed: {
          mines: { floor: 21, spells: [] },
          npcLevels: { adeline: 10 },
          npcRelationships: { adeline: "romantic" },
          renown: 14,
          skillLevels: { mining: 22 },
        },
        showSpoilers: true,
      }),
    );

    for (const path of ["/characters", "/skills", "/mines", "/renown", "/all"]) {
      await gotoApplication(page, path);
      expect(findOverflow(await collectVisibleElementBoxes(page), 320), path).toEqual([]);
    }
  });

  test("category headings leave room for display-font descenders", async ({ page }) => {
    await gotoApplication(page, "/recipes");
    const metrics = await page.locator(".page-header__title").evaluate((heading) => {
      const style = getComputedStyle(heading);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });

    expect(metrics.lineHeight).toBeGreaterThan(metrics.fontSize);
  });
});

test.describe("@critical interactive target geometry", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light");
  });

  test("visible home controls meet the 24-pixel size-or-spacing rule", async ({ page }) => {
    await gotoApplication(page, "/");
    const violations = findTargetSizeViolations(await collectVisibleTargets(page));
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("home category ribbons stay inside the viewport at 320 pixels", async ({ page }) => {
    await page.setViewportSize({ height: 720, width: 320 });
    await gotoApplication(page, "/");
    await expect(page.locator("[data-category-ribbon]").first()).toBeVisible();
    expect(findOverflow(await collectVisibleElementBoxes(page), 320)).toEqual([]);
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

test.describe("@critical tracker paper geometry", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await initializeApplication(page, "light");
    await gotoApplication(page, "/almanac");
    await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed$/ }).click();
  });

  test("source control and paper borders preserve the two-sheet geometry", async ({ page }) => {
    const row = page
      .locator("[data-tracker-row]")
      .filter({ has: page.locator('button[aria-controls^="sources-"]') })
      .first();
    const nextRow = row.locator("xpath=following-sibling::*[@data-tracker-row][1]");
    const sourceButton = row.locator("button[aria-controls]");
    const sourcePaper = row.locator("[data-source-paper]");
    const whitePaper = row.locator(".tracker-paper__surface");
    const nextWhitePaper = nextRow.locator(".tracker-paper__surface");
    const diagonal = row.locator("[data-tracker-paper-diagonal] path");

    await expect(row).toBeVisible();
    await expect(nextRow).toBeVisible();
    const before = await sourceButton.boundingBox();
    expect(before).not.toBeNull();
    expect(before?.width).toBeGreaterThanOrEqual(32);
    expect(before?.height).toBeGreaterThanOrEqual(32);

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
    expect(await diagonal.evaluate((element) => getComputedStyle(element).strokeWidth)).toBe("1px");

    await sourceButton.click();
    await expect(row).toHaveAttribute("data-source-state", "open");
    await expect(row.locator(".source-card")).toBeVisible();
    await page.waitForTimeout(300);
    const after = await sourceButton.boundingBox();
    expect(after).not.toBeNull();
    expect(
      Math.abs((after?.x ?? 0) + (after?.width ?? 0) - ((before?.x ?? 0) + (before?.width ?? 0))),
    ).toBeLessThanOrEqual(0.5);
    expect(after?.y ?? 0).toBeGreaterThan(before?.y ?? 0);
    const stationaryControl = row.locator("[data-source-paper-stationary-control]");
    const stationary = await stationaryControl.boundingBox();
    expect(stationary).not.toBeNull();
    expect(Math.abs((stationary?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(0.5);
    expect(Math.abs((stationary?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(0.5);
    expect(
      await whitePaper.evaluate((element) => getComputedStyle(element).borderBottomWidth),
    ).toBe("1px");
    expect(
      await nextWhitePaper.evaluate((element) => getComputedStyle(element).borderTopWidth),
    ).toBe("1px");

    const gap = await row.evaluate((element) => {
      const source = element.querySelector<HTMLElement>("[data-source-paper]");
      const next =
        element.nextElementSibling?.querySelector<HTMLElement>(".tracker-paper__surface");
      if (!source || !next) return null;
      return next.getBoundingClientRect().top - source.getBoundingClientRect().bottom;
    });
    expect(gap).not.toBeNull();
    expect(Math.abs((gap ?? 0) - 6)).toBeLessThanOrEqual(0.5);

    await stationaryControl.click({ position: { x: 2, y: 2 } });
    await expect(row).toHaveAttribute("data-source-state", "closed");
    await page.waitForTimeout(300);
    const closedAgain = await sourceButton.boundingBox();
    expect(Math.abs((closedAgain?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(0.5);
  });
});

test.describe("@critical tracker paper touch geometry", () => {
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

  test("specialized record controls retain 44-pixel coarse targets", async ({ page }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({
        availabilityMode: "everything",
        completed: {
          npcLevels: { adeline: 10 },
          npcRelationships: { adeline: "romantic" },
        },
        showSpoilers: true,
      }),
    );

    await gotoApplication(page, "/characters");
    for (const control of await page
      .locator("#npc-adeline .npc-stepper, #npc-adeline [data-relationship-action]")
      .all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const index = page.getByRole("navigation", { name: "Townsfolk alphabet" });
    const beforeScroll = await index.boundingBox();
    const roster = await page.locator(".npc-roster").boundingBox();
    const whitespaceCenter = ((roster?.x ?? 0) + (roster?.width ?? 0) + 320) / 2;
    expect(
      Math.abs((beforeScroll?.x ?? 0) + (beforeScroll?.width ?? 0) / 2 - whitespaceCenter),
    ).toBe(0);
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
    const afterScroll = await index.boundingBox();
    expect(Math.abs((afterScroll?.y ?? 0) - (beforeScroll?.y ?? 0))).toBeLessThanOrEqual(0.5);
    expect(afterScroll?.y).toBeGreaterThanOrEqual(62);
    expect((afterScroll?.y ?? 0) + (afterScroll?.height ?? 0)).toBeLessThanOrEqual(652);

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
