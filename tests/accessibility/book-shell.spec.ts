import { PROGRESS_STORAGE_KEY } from "../../src/lib/stores/storage-keys.js";
import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { requireBox, settledBox } from "./support/boxes.js";
import { villagerRecord } from "./support/scenarios.js";

import type { Page } from "@playwright/test";

import type { Box } from "./support/boxes.js";

// The smallest window that gets the book layout: `(min-width: 48rem) and (min-height: 34rem)`.
const BOOK_MINIMUM = { height: 544, width: 768 };
const DESKTOP = { height: 720, width: 1280 };
const PHONE = { height: 844, width: 390 };

// Keep action traces without serializing the entire ledger after each action on retry.
test.use({
  trace: {
    mode: process.env.CI === "true" ? "on-first-retry" : "retain-on-failure",
    snapshots: false,
  },
});

for (const { locale, placeholder, width } of [
  { locale: "fr", placeholder: "Rechercher dans le catalogue", width: 960 },
  { locale: "ru", placeholder: "Поиск в альманахе", width: 820 },
]) {
  test(`the almanac search label fits at ${width}px in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ height: 800, width });
    await gotoApplication(page, `/${locale}/almanac`);
    const localizedField = page.getByPlaceholder(placeholder, { exact: true });
    await expect(localizedField).toBeVisible();
    const remaining = await localizedField.evaluate(async (input: HTMLInputElement) => {
      await document.fonts.ready;
      const style = getComputedStyle(input);
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Missing canvas text measurement");
      context.font = `${style.fontStyle} ${style.fontSize} ${style.fontFamily}`;
      return (
        input.clientWidth -
        Number(style.paddingLeft.replace("px", "")) -
        Number(style.paddingRight.replace("px", "")) -
        context.measureText(input.placeholder).width
      );
    });
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
}

function tabs(page: Page) {
  return page.getByRole("navigation", { name: "Thumb index" });
}

async function isTurning(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("book-turning"));
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe("Home before hydration", () => {
  test.use({ javaScriptEnabled: false });

  test("links to Everything without a placeholder count", async ({ page }) => {
    await page.goto("/en");
    const contents = page.getByRole("navigation", { name: "Contents" });
    await expect(contents.getByRole("link", { exact: true, name: "Everything" })).toBeVisible();
  });

  test("keeps the farm clock neutral", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("button", { name: "Which day is it?" })).toBeDisabled();
    await expect(page.getByText("day-one defaults", { exact: true })).toBeHidden();
    await expect(page.getByRole("link", { exact: true, name: "Load a save" })).toBeHidden();
    await expect(page.getByRole("region", { name: "Birthdays this week" })).toBeHidden();
  });
});

test("Home clock starts the picker on day one and keeps year one when the day changes", async ({
  page,
}) => {
  await initializeApplication(page, "light");
  await gotoApplication(page, "/en");
  await page.getByRole("button", { name: "Spring 1, Year 1" }).click();

  const picker = page.getByRole("dialog", { name: "Season & weather" });
  const day = picker.getByLabel("Day", { exact: true });
  const year = picker.getByLabel("Year", { exact: true });
  await expect(day).toHaveValue("1");
  await expect(year).toHaveValue("1");
  await day.selectOption("5");
  await expect(year).toHaveValue("1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Spring 5, Year 1" })).toBeVisible();

  await page.getByRole("button", { name: "Spring 5, Year 1" }).click();
  await day.selectOption("");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Which day is it?" })).toBeVisible();
});

test("Home clock preserves an unknown year on an existing calendar", async ({ page }) => {
  await initializeApplication(
    page,
    "light",
    createStoredState({ worldState: { day: 5, season: "spring", weather: "calm" } }),
  );
  await gotoApplication(page, "/en");
  await page.getByRole("button", { exact: true, name: "Spring 5" }).click();
  const picker = page.getByRole("dialog", { name: "Season & weather" });
  await expect(picker.getByLabel("Year", { exact: true })).toHaveValue("");
  await picker.getByLabel("Day", { exact: true }).selectOption("6");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { exact: true, name: "Spring 6" })).toBeVisible();
});

test("Home Contents gives Everything an overall completion count after hydration", async ({
  page,
}) => {
  await initializeApplication(page, "light", createStoredState({ progress: { renown: 10 } }));
  await gotoApplication(page, "/en");
  const contents = page.getByRole("navigation", { name: "Contents" });
  const everything = contents.getByRole("link", {
    name: /^Everything, [\d,]+ of [\d,]+ completed$/u,
  });
  await expect(everything).toBeVisible();
  await expect(everything).toHaveAttribute("href", "/en/everything?group=source");
});

test("Home opens available quests in Everything's category view", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/");
  const quests = page
    .getByRole("region", { name: "Places to go today" })
    .getByRole("link", { name: /^Available quests Quests [\d,]+$/u });
  await quests.click();
  await expect(page).toHaveURL(/\/en\/everything\?group=category#category-quests$/u);
  await expect(
    page.getByRole("button", { exact: true, expanded: true, name: "Quests" }),
  ).toBeVisible();
});

test("Home shows the last imported farmer and farm on its bookplate", async ({ page }) => {
  const state = createStoredState();
  state.progress.lastImport = {
    farmName: "Meadow Farm",
    identity: { creationVersion: null, saveNumber: null },
    importedAt: Date.now(),
    playerName: "Dewey",
  };
  await initializeApplication(page, "light", state);
  await gotoApplication(page, "/");
  // oxlint-disable-next-line playwright/no-raw-locators -- The flyleaf plate is a layout box with no landmark role.
  const plate = page.locator(".bookplate");
  const farmer = plate.getByText("Dewey", { exact: true });
  const farm = plate.getByText("Meadow Farm", { exact: true });
  await expect(farmer).toBeVisible();
  await expect(farm).toBeVisible();
  const field = search(page);
  await field.fill("turnip");
  await expect(plate).toBeHidden();
  await field.press("Escape");
  await expect(farmer).toBeVisible();
  await expect(farm).toBeVisible();
});

test.describe("book shell", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "system", createStoredState());
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
    // A mouse names a tab on hover, so the names toggle is only for touch screens.
    await expect(tabs(page).getByRole("button", { name: "Show tab names" })).toBeHidden();
    const last = await settledBox(links.last());
    const feedback = await settledBox(
      page.getByRole("button", { exact: true, name: "Send feedback" }),
    );
    const settings = await settledBox(
      page.getByRole("button", { exact: true, name: "Quick settings" }),
    );

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

  for (const key of ["Space", "PageDown"]) {
    test(`${key} scrolls the document while the thumb index stays pinned`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await gotoApplication(page, "/almanac");
      const index = await settledBox(tabs(page));

      await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBe(0);
      await page.keyboard.press(key);

      await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(0);
      const scrolledIndex = await settledBox(tabs(page));
      expect(scrolledIndex.y).toBe(index.y);
    });
  }

  test("a direct section link scrolls the document to the target", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoApplication(page, "/en/villagers#villager-valen");

    await expect(villagerRecord(page, "valen")).toBeInViewport();
    await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(0);
  });

  test("Chromium find-in-page brings an offscreen section into view", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoApplication(page, "/en/privacy");
    const sync = page.getByRole("heading", { exact: true, name: "With sync" });

    await expect(sync).not.toBeInViewport();
    // Playwright cannot operate the browser's Find bar. Exercise its in-page search via Chromium.
    const found = await page.evaluate(() =>
      (globalThis as typeof globalThis & { find: (text: string) => boolean }).find("With sync"),
    );

    expect(found).toBe(true);
    await expect(sync).toBeInViewport();
    await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(0);
  });

  test.describe("touch at book widths", () => {
    test.use({ hasTouch: true });

    test("tab names can be toggled with the keyboard", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await gotoApplication(page, "/almanac");
      const toggle = tabs(page).getByRole("button", { name: "Show tab names" });
      const museum = tabs(page).getByRole("link", { name: "Museum" });
      const label = museum.getByText("Museum", { exact: true });

      await toggle.focus();
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(label).toHaveCSS("opacity", "0");
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(label).toHaveCSS("opacity", "1");
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
      await expect(label).toHaveCSS("opacity", "0");
    });

    test("the visible Russian tab name can be tapped in a short dark window", async ({ page }) => {
      await page.setViewportSize(BOOK_MINIMUM);
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await gotoApplication(page, "/ru");
      const index = page.getByRole("navigation", { name: "Закладки разделов" });
      const toggle = index.getByRole("button", { name: "Показать названия закладок" });
      const museum = index.getByRole("link", { name: "Музей" });
      const label = museum.getByText("Музей", { exact: true });

      await toggle.tap();
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(label).toHaveCSS("opacity", "1");
      await expect(label).toBeInViewport({ ratio: 1 });
      await label.tap();
      await expect(page).toHaveURL(/\/ru\/museum$/);
      await expect(museum).toHaveAttribute("aria-current", "page");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
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

function search(page: Page) {
  return page.getByRole("textbox", { name: "Search items" });
}

function undo(page: Page) {
  return page
    .getByRole("region", { name: /^Notifications/u })
    .getByRole("button", { exact: true, name: "Undo" });
}

/** A layout box the test measures: the page header, its count, or its ribbon. */
function headerPart(page: Page, selector: string) {
  // oxlint-disable-next-line playwright/no-raw-locators -- header geometry boxes have no role; Home's header isn't a landmark
  return page.locator(selector);
}

async function checkOffFirstArtifact(page: Page): Promise<void> {
  const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
  await artifacts
    .getByRole("button", { name: /^Check (?!spoilered item)/ })
    .first()
    .click();
  await expect(undo(page)).toBeVisible();
}

test.describe("page header & tools", () => {
  test.beforeEach(async ({ page }) => {
    await initializeApplication(page, "system", createStoredState());
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("Home keeps the search tools beside the title and above today's date", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoApplication(page, "/");
    const title = await settledBox(page.getByRole("heading", { level: 1 }));
    const field = await settledBox(search(page));
    const clock = await settledBox(page.getByRole("button", { name: "Which day is it?" }));
    expect(field.x).toBeGreaterThanOrEqual(title.x + title.width);
    expect(field.y).toBeLessThan(title.y + title.height);
    expect(field.y + field.height).toBeGreaterThan(title.y);
    expect(field.y + field.height).toBeLessThanOrEqual(clock.y);
  });

  for (const path of ["/animals", "/almanac"]) {
    test(`${path} carries its tools in its own header row`, async ({ page }) => {
      await gotoApplication(page, path);
      const row = await settledBox(headerPart(page, "[data-page-header]"));
      const field = await settledBox(search(page));
      expect(field.y, "search below the header's top").toBeGreaterThanOrEqual(row.y);
      expect(field.y + field.height, "search above its foot").toBeLessThanOrEqual(
        row.y + row.height,
      );
      expect(field.x, "search at the header's end").toBeGreaterThan(row.x + row.width / 2);
    });
  }

  test("the header follows the window as it narrows", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 1440 });
    await gotoApplication(page, "/almanac");
    await settledBox(page.getByRole("region", { exact: true, name: "Artifacts" }));
    await page.setViewportSize({ height: 800, width: 1000 });

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(1000);
    const header = await settledBox(headerPart(page, "[data-page-header]"));
    // The thumb index starts where the page ends.
    const index = await settledBox(tabs(page));
    expect(header.x + header.width).toBeLessThanOrEqual(index.x + 0.5);
    const count = await settledBox(headerPart(page, ".page-header__count"));
    const field = await settledBox(search(page));
    expect(overlaps(count, field), "the count & the search field").toBe(false);
  });

  test("the header's ribbon steps aside at half-screen widths", async ({ page }) => {
    const ribbon = headerPart(page, "[data-page-header-ribbon]");
    await page.setViewportSize({ height: 800, width: 960 });
    await gotoApplication(page, "/almanac");
    await expect(ribbon).toBeHidden();
    await page.setViewportSize(DESKTOP);
    await expect(ribbon).toBeVisible();
  });

  test("the current tab doesn't name itself under a resting pointer", async ({ page }) => {
    await gotoApplication(page, "/almanac");
    const current = tabs(page).getByRole("link", { name: "Almanac" });
    const museum = tabs(page).getByRole("link", { name: "Museum" });

    await museum.hover();
    await expect(museum.getByText("Museum", { exact: true })).toHaveCSS("opacity", "1");
    await current.hover();
    await expect(current.getByText("Almanac", { exact: true })).toHaveCSS("opacity", "0");
  });

  test("Undo stays at the screen's foot while a panel hangs from the header", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoApplication(page, "/almanac");
    await checkOffFirstArtifact(page);
    const before = await settledBox(undo(page));

    await page.getByRole("button", { name: "Visibility filters" }).click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
    const after = await settledBox(undo(page));
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test("Undo stays on screen over Contents on a landscape phone", async ({ page }) => {
    await gotoApplication(page, "/almanac");
    await checkOffFirstArtifact(page);
    await page.setViewportSize(PHONE);
    await page.getByRole("button", { exact: true, name: "Contents" }).click();
    await expect(page.getByRole("dialog", { name: "Contents" })).toBeVisible();
    await page.setViewportSize({ height: PHONE.width, width: PHONE.height });

    await expect(undo(page)).toBeInViewport({ ratio: 1 });
  });
});

for (const viewport of [DESKTOP, PHONE]) {
  test(`newer progress shows recovery at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = createStoredState();
    state.progress.version++;
    await initializeApplication(page, "light", state);
    await gotoApplication(page, "/almanac");

    const notice = page
      .getByRole("alert")
      .filter({ hasText: "A newer version of the field guide" });
    const reload = notice.getByRole("button", { name: "Reload" });
    await expect(reload).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_STORAGE_KEY)).toBe(
      JSON.stringify(state.progress),
    );
    await Promise.all([page.waitForEvent("domcontentloaded"), reload.click()]);
    await expect(reload).toBeVisible();
  });
}
