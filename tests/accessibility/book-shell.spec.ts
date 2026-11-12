import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { requireBox, settledBox } from "./support/boxes.js";

import type { Page } from "@playwright/test";

import type { Box } from "./support/boxes.js";

// The smallest window that gets the book layout: `(min-width: 48rem) and (min-height: 34rem)`.
const BOOK_MINIMUM = { height: 544, width: 768 };
const DESKTOP = { height: 720, width: 1280 };
const PHONE = { height: 844, width: 390 };

function tabs(page: Page) {
  return page.getByRole("navigation", { name: "Thumb index" });
}

async function isTurning(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("book-turning"));
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe("book shell", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "light", createStoredState());
  });

  test("a click on a thumb tab behind the feedback scrim keeps the page & the draft", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoApplication(page, "/almanac");
    const trigger = page.getByRole("button", { exact: true, name: "Send feedback" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Send feedback" });
    await dialog.getByRole("textbox").first().fill("A draft worth keeping");

    // A real pointer click where the tab is, which lands on whatever is on top.
    const museum = await requireBox(tabs(page).getByRole("link", { name: "Museum" }));
    await page.mouse.click(museum.x + museum.width / 2, museum.y + museum.height / 2);

    await expect(page).toHaveURL(/\/almanac$/);
    await trigger.click();
    await expect(dialog.getByRole("textbox").first()).toHaveValue("A draft worth keeping");
  });

  test("the rail fits every tab & both tools at the smallest book window", async ({ page }) => {
    await page.setViewportSize(BOOK_MINIMUM);
    await gotoApplication(page, "/");
    await expect(tabs(page)).toBeVisible();

    const links = tabs(page).getByRole("link");
    await expect(links).toHaveCount(12);
    const names = await settledBox(tabs(page).getByRole("button", { name: "Show tab names" }));
    const first = await settledBox(links.first());
    const last = await settledBox(links.last());
    const feedback = await settledBox(
      page.getByRole("button", { exact: true, name: "Send feedback" }),
    );
    const settings = await settledBox(
      page.getByRole("button", { exact: true, name: "Quick settings" }),
    );

    expect(overlaps(names, first), "names toggle & Home").toBe(false);
    expect(overlaps(last, feedback), "Everything & Send feedback").toBe(false);
    expect(overlaps(feedback, settings), "Send feedback & Quick settings").toBe(false);
    expect(settings.y + settings.height).toBeLessThanOrEqual(BOOK_MINIMUM.height);

    // One pixel shorter, the tabs fold into Contents.
    await page.setViewportSize({ ...BOOK_MINIMUM, height: BOOK_MINIMUM.height - 1 });
    await expect(tabs(page)).toBeHidden();
    await expect(page.getByRole("button", { exact: true, name: "Contents" })).toBeVisible();
  });

  test("closing Quick settings after a resize to book widths focuses the rail's", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await gotoApplication(page, "/");
    await page.getByRole("button", { exact: true, name: "Contents" }).click();
    // The rail is hidden on a phone, so this is the Contents panel's row.
    await page.getByRole("button", { exact: true, name: "Quick settings" }).click();
    await expect(page.getByRole("heading", { name: "Quick settings" })).toBeVisible();

    await page.setViewportSize(DESKTOP);
    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { name: "Quick settings" })).toBeHidden();
    await expect(page.getByRole("button", { exact: true, name: "Quick settings" })).toBeFocused();
  });

  test("closing Quick settings after a resize to a phone focuses Contents", async ({ page }) => {
    await gotoApplication(page, "/");
    await page.getByRole("button", { exact: true, name: "Quick settings" }).click();
    await expect(page.getByRole("heading", { name: "Quick settings" })).toBeVisible();

    await page.setViewportSize(PHONE);
    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { name: "Quick settings" })).toBeHidden();
    await expect(page.getByRole("button", { exact: true, name: "Contents" })).toBeFocused();
  });

  test("Back after a page turn restores the scroll position", async ({ page }) => {
    await gotoApplication(page, "/almanac");
    await page.evaluate(() => {
      globalThis.scrollTo(0, 252);
    });
    await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBe(252);

    await tabs(page).getByRole("link", { name: "Museum" }).click();
    await expect(page).toHaveURL(/\/museum$/);
    await expect.poll(() => isTurning(page)).toBe(false);

    await page.goBack();
    await expect(page).toHaveURL(/\/almanac$/);
    await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBe(252);
    await expect.poll(() => isTurning(page)).toBe(false);
  });

  test("quick page turns in a row land on the last page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await gotoApplication(page, "/almanac");

    // No waiting between clicks: each turn starts while the one before is still running.
    for (const name of ["Museum", "Skills", "Recipes"]) {
      await tabs(page).getByRole("link", { name }).click();
    }

    await expect(page).toHaveURL(/\/recipes$/);
    await expect(tabs(page).getByRole("link", { name: "Recipes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect.poll(() => isTurning(page)).toBe(false);
    expect(errors).toEqual([]);
  });
});
