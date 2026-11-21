import { readFileSync } from "node:fs";

import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { ledgerButton, ledgerChecks, placeTrigger } from "./support/ledger.js";
import { closeSearch, openSearch, openVisibilityPanel } from "./support/scenarios.js";

/*
 * Everything's source ledger keeps about 50,000 elements, and a trace's DOM snapshot after each
 * action took tens of seconds there, timing these tests out locally & on CI's traced retry. Keep
 * the trace's actions & screenshots (same modes as playwright.config.ts) without DOM snapshots.
 */
test.use({
  trace: {
    mode: process.env.CI === "true" ? "on-first-retry" : "retain-on-failure",
    snapshots: false,
  },
});

for (const { theme, touch, width } of [
  { theme: "light", touch: false, width: 1440 },
  { theme: "dark", touch: true, width: 820 },
  { theme: "dark", touch: true, width: 390 },
] as const) {
  test.describe(`Source ledger at ${width}px`, () => {
    test.use({ hasTouch: touch, isMobile: touch, viewport: { height: 900, width } });

    test("opens a place from Home and keeps the check and its undo in place", async ({ page }) => {
      // Restoring every closed-place title after clearing search can contend with the other
      // Chromium workers on Linux. Keep all three viewports on the same end-to-end path.
      test.slow();
      await initializeApplication(page, theme, createStoredState());
      await gotoApplication(page, "/");
      const link = page
        .getByRole("region", { name: "Places to go today" })
        .getByRole("link")
        .first();
      const destination = await link.getAttribute("href");
      const homeLabel = await link.textContent();
      const homeCount = homeLabel?.match(/([\d,]+) to do/u)?.[1] ?? "";
      expect(homeCount).toBeTruthy();
      await (touch ? link.tap() : link.click());
      await expect(page).toHaveURL(new URL(destination ?? "", page.url()).href);

      const placeId = new URL(page.url()).hash;
      // oxlint-disable-next-line playwright/no-raw-locators -- the Home link supplies the place anchor
      const place = page.locator(placeId);
      const check = place.getByRole("button", { name: /^Check (?!spoilered item)/ }).first();
      const label = await check.getAttribute("aria-label");
      const name = label?.slice(6) ?? "";
      const checkItem = place.getByRole("button", { exact: true, name: `Check ${name}` });
      const uncheckItem = place.getByRole("button", { exact: true, name: `Uncheck ${name}` });
      const shelfCount = place.getByText(`${homeCount} to do`, { exact: true });
      await expect(shelfCount).toBeVisible();
      const rowHeight = await checkItem.evaluate(
        (button) => button.closest("[data-ledger-row]")?.getBoundingClientRect().height ?? 0,
      );
      if (touch) expect(rowHeight).toBeGreaterThanOrEqual(44);
      else expect(rowHeight).toBeLessThan(44);
      await (touch ? checkItem.tap() : checkItem.click());

      await expect(uncheckItem).toBeVisible();
      await expect(shelfCount).toBeVisible();
      if (!touch) await expect(uncheckItem).toBeFocused();
      // Scoped to the toasts: a page-wide button query checks visibility on every row's buttons,
      // and Everything's source ledger keeps about 50,000 elements, which took Playwright 27 s.
      const undo = page
        .getByRole("region", { name: /^Notifications/u })
        .getByRole("button", { exact: true, name: "Undo" });
      await (touch ? undo.tap() : undo.press("Enter"));
      await expect(checkItem).toBeVisible();
      if (!touch) await expect(checkItem).toBeFocused();

      await openSearch(page, name);
      await expect(checkItem).toBeVisible();
      await closeSearch(page);
      await openVisibilityPanel(page);
      const filters = page.getByRole("dialog", { name: "Filters" });
      if (width < 701) await filters.getByRole("button", { name: /^Source types/ }).click();
      await filters.getByRole("switch", { exact: true, name: "Stores" }).click();
      await page.keyboard.press("Escape");
      await expect(place).toBeHidden();
    });
  });
}

test("keeps the tools and section index within reach in the middle of Furniture", async ({
  page,
}) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const distantRow = ledgerChecks(furniture).nth(50);
  const spriteMask = () =>
    distantRow.evaluate((button) =>
      button
        .closest("[data-ledger-row]")
        ?.querySelector<HTMLElement>("[data-sprite-treatment]")
        ?.style.getPropertyValue("--sprite-url"),
    );
  expect(await spriteMask()).toBe("");
  await distantRow.scrollIntoViewIfNeeded();
  await expect.poll(spriteMask).toMatch(/^url\(/u);
  const contents = page.getByRole("navigation", { name: "Page sections" });
  await expect(contents.getByRole("link", { exact: true, name: "Furniture" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  const tools = page.getByRole("navigation", { name: "Field guide tools" });
  const clock = tools.getByRole("button", { name: /^Season & weather/ });
  await expect(clock).toBeInViewport();
  await clock.click();
  await page.getByRole("radio", { exact: true, name: "Winter" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Your progress or the day changed.")).toBeInViewport();
  // The notice pushes the stuck heads & the rail down rather than covering them.
  const noticeBottom = await page
    .getByText("Your progress or the day changed.")
    .evaluate((text) => text.parentElement?.getBoundingClientRect().bottom ?? 0);
  await expect
    .poll(() => contents.evaluate((nav) => nav.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(noticeBottom);
  await expect
    .poll(() =>
      furniture.evaluate(
        (section) => section.querySelector("[data-ledger-head]")?.getBoundingClientRect().top ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(noticeBottom - 1);
  // oxlint-disable-next-line playwright/no-raw-locators -- the notice is a live region with no name
  await page
    .locator("[data-ledger-notice]")
    .getByRole("button", { name: "Refresh shelves" })
    .click();
  await expect(page.getByText("Your progress or the day changed.")).toHaveCount(0);
});

test("a section jump and a repeated jump focus the heading", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const contents = page.getByRole("navigation", { name: "Page sections" });
  const materials = contents.getByRole("link", { exact: true, name: "Materials" });
  await materials.click();
  await expect(page).toHaveURL(/#materials$/u);
  await expect(materials).toHaveAttribute("aria-current", "location");
  const materialsHeading = page.getByRole("heading", { exact: true, name: "Materials" });
  await expect(materialsHeading).toBeFocused();
  await materials.press("Enter");
  await expect(materialsHeading).toBeFocused();

  const songCrystals = contents.getByRole("link", { exact: true, name: "Song Crystals" });
  await songCrystals.click();
  await expect(page).toHaveURL(/#song_crystal$/u);
  await expect(songCrystals).toHaveAttribute("aria-current", "location");
  const crystals = page.getByRole("region", { exact: false, name: /^Song Crystals/ });
  // Every Song Crystal comes from a chest, so the column head names it but highlights nothing.
  await expect(crystals.getByText("Chests", { exact: true }).first()).toBeVisible();
  await expect(
    crystals.getByRole("button", { exact: true, name: "Highlight rows from Chests" }),
  ).toHaveCount(0);
});

test("Back restores the Furniture row and its offset", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const check = ledgerChecks(furniture).nth(20);
  const label = (await check.getAttribute("aria-label")) ?? "";
  const row = ledgerButton(furniture, label);
  const position = () => row.evaluate((element) => element.getBoundingClientRect().top);
  await row.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  const top = await position();

  await page.getByRole("link", { name: "Back to home" }).click();
  // `toHaveURL` snapshots the whole Almanac's accessibility tree on each miss, stalling the turn.
  await page.waitForURL(/\/en\/?$/u);
  await page.goBack();
  await expect(row).toBeInViewport();
  await expect.poll(async () => Math.abs((await position()) - top)).toBeLessThan(8);
});

test("clearing a zero-match search restores the same Furniture row element", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac");
  // Cancel before the debounce commits. The next search starts from Furniture, not Artifacts.
  const search = page.getByRole("textbox", { name: "Search items" });
  await search.evaluate((input: HTMLInputElement) => {
    input.focus();
    input.value = "p";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  });
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  // Let content above Furniture settle before measuring the row's starting offset.
  // oxlint-disable-next-line playwright/no-raw-locators -- Count ready rows across open and closed shelves.
  await expect.poll(() => furniture.locator("[data-ledger-fact]").count()).toBeGreaterThan(1000);
  const row = ledgerButton(furniture, "Check Basic Doormat");
  await row.evaluate((element) => {
    const ledgerRow = element.closest<HTMLElement>("[data-ledger-fact]");
    if (ledgerRow) ledgerRow.dataset.searchRestoreProbe = "original";
    element.scrollIntoView({ block: "center" });
  });
  const position = () => row.evaluate((element) => element.getBoundingClientRect().top);
  const top = await position();
  await openSearch(page, "zzq-no-matching-furniture");
  await expect(page.getByRole("status").filter({ hasText: "No items found" })).toHaveCount(1);
  await closeSearch(page);
  await expect.poll(async () => Math.abs((await position()) - top)).toBeLessThan(8);
  const elementIdentity = await row.evaluate(
    (element) => element.closest<HTMLElement>("[data-ledger-fact]")?.dataset.searchRestoreProbe,
  );
  expect(elementIdentity).toBe("original");
  await expect(search).toBeFocused();
});

test("a fresh Song Crystals link stays aligned after the ledger fills", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#song_crystal");
  const heading = page.getByRole("heading", { exact: true, name: "Song Crystals" });
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  // The last idle chunks include the titles that Browser Find can reveal in Furniture.
  // oxlint-disable-next-line playwright/no-raw-locators -- Count mounted rows across closed shelves.
  await expect.poll(() => furniture.locator("[data-ledger-fact]").count()).toBeGreaterThan(1000);
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
});

test("the Almanac section head scrolls away in a short window", async ({ page }) => {
  await page.setViewportSize({ height: 450, width: 640 });
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const row = furniture.getByRole("button", { name: /^Check (?!spoilered item)/ }).nth(25);
  await row.scrollIntoViewIfNeeded();
  await expect(
    furniture.getByRole("heading", { exact: true, name: "Furniture" }),
  ).not.toBeInViewport();
  await expect(page.getByRole("textbox", { name: "Search items" })).toBeInViewport();
});

test("closed source names are findable and native reveal opens the matching row", async ({
  page,
}) => {
  // The browser first builds the searchable titles for the whole source ledger.
  test.slow();
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/everything?group=source");
  const balor = placeTrigger(page, "Balor's Wagon");
  await expect(balor).toHaveAttribute("aria-expanded", "false");

  const contentId = await balor.getAttribute("aria-controls");
  // Chromium's browser Find bar and fragment navigation run the same native reveal algorithm.
  // oxlint-disable-next-line playwright/no-raw-locators -- the disclosure supplies the content ID
  const hiddenMatch = page.locator(`[id="${contentId}"]`).getByText("Barrel Hat", { exact: true });
  await expect(hiddenMatch).toBeAttached();
  await expect(hiddenMatch).toBeHidden();
  // The closed titles mount after the ledger's headings, so wait for Find to reach them.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (globalThis as typeof globalThis & { find: (query: string) => boolean }).find("Barrel Hat"),
      ),
    )
    .toBe(true);
  await hiddenMatch.evaluate((match) => {
    match.id = "test-browser-find-target";
    location.hash = match.id;
  });
  await expect(balor).toHaveAttribute("aria-expanded", "true");
  await expect(hiddenMatch).toHaveAttribute("id", "test-browser-find-target");
  await expect(ledgerButton(page, "Check Barrel Hat")).toBeInViewport();
});

test("a section's stuck head names the shelf scrolling under it", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  // oxlint-disable-next-line playwright/no-raw-locators -- the head is a layout box with no role
  const head = furniture.locator("[data-ledger-head]");
  await expect(head).toContainText("To do");
  // A closed fold names itself, so the head keeps the To do count while it passes under.
  const notNowFold = furniture.getByText("Not now", { exact: true });
  await notNowFold.evaluate((fold) => {
    fold.scrollIntoView({ block: "start" });
    globalThis.scrollBy(0, 40);
  });
  await expect(head).toContainText("To do");
  await expect(head).not.toContainText("Not now");

  await notNowFold.click();
  const notNowRow = furniture
    .getByRole("group")
    .getByRole("button", { name: /^Check / })
    .nth(5);
  await notNowRow.evaluate((row) => {
    row.scrollIntoView({ block: "center" });
  });
  await expect(head).toContainText("Not now");
});

/** The late-game save's checked Almanac items, which finish ten of the twelve sections. */
function lateGameAlmanac(): string[] {
  const fixtures = JSON.parse(
    readFileSync(
      new URL("../../scripts/fixtures/field-guide-progress.json", import.meta.url),
      "utf8",
    ),
  ) as Record<"late-game", { progress: { almanac: string[] } }>;
  return fixtures["late-game"].progress.almanac;
}

test("finished sections sit on the Completed shelf as one line each, and open in place", async ({
  page,
}) => {
  const almanac = lateGameAlmanac();
  expect(almanac.length).toBeGreaterThan(1000);
  await initializeApplication(page, "light", createStoredState({ progress: { almanac } }));
  await gotoApplication(page, "/almanac");
  // The page's running heads, over its To do & Completed shelves of sections.
  await expect(page.getByText("2 sections", { exact: true })).toBeVisible();
  await expect(page.getByText("10 sections", { exact: true })).toBeVisible();

  const bugs = page.getByRole("region", { exact: true, name: "Bugs" });
  const line = bugs.getByRole("button", { exact: true, name: "Bugs" });
  await expect(line).toHaveAttribute("aria-expanded", "false");
  // One line: no section-level Completed fold, so “Completed” isn't printed twice.
  await expect(bugs.getByText("Completed", { exact: true })).toBeHidden();
  await expect(bugs.getByRole("button", { name: /^Uncheck / })).toHaveCount(0);

  await line.click();
  await expect(bugs.getByRole("button", { exact: true, name: "Uncheck Ant" })).toBeVisible();
  await bugs.getByRole("button", { exact: true, name: "Bugs" }).click();
  await expect(bugs.getByRole("button", { exact: true, name: "Bugs" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("a search matching one closed shelf in a section prints one line that opens it", async ({
  page,
}) => {
  await initializeApplication(
    page,
    "light",
    createStoredState({ progress: { almanac: lateGameAlmanac() } }),
  );
  await gotoApplication(page, "/almanac");
  await openSearch(page, "copper");
  const blacksmithing = page.getByRole("region", { exact: true, name: "Blacksmithing" });
  const line = blacksmithing.getByRole("button", { exact: true, name: "Blacksmithing" });
  await expect(line).toHaveAttribute("aria-expanded", "false");
  await expect(line).toContainText("Completed");
  await line.click();
  await expect(
    blacksmithing.getByRole("button", { name: /^Uncheck Copper/u }).first(),
  ).toBeVisible();
});

test.describe("Almanac on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { height: 844, width: 390 } });

  test("a fresh visit opens on the section list, and a tap opens one in place", async ({
    page,
  }) => {
    await initializeApplication(page, "light", createStoredState());
    await gotoApplication(page, "/almanac");
    const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
    const line = artifacts.getByRole("button", { exact: true, name: "Artifacts" });
    await expect(line).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("region", { exact: true, name: "Song Crystals" }).getByRole("button", {
        exact: true,
        name: "Song Crystals",
      }),
    ).toBeInViewport();

    await line.tap();
    await expect(artifacts.getByRole("button", { name: /^Check / }).first()).toBeVisible();
    await artifacts.getByRole("button", { exact: true, name: "Artifacts" }).tap();
    await expect(artifacts.getByRole("button", { name: /^Check / }).first()).toBeHidden();
  });

  test("a link still goes straight to its section", async ({ page }) => {
    await initializeApplication(page, "light", createStoredState());
    await gotoApplication(page, "/almanac#furniture");
    const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
    await expect(furniture.getByRole("button", { name: /^Check / }).first()).toBeInViewport();
  });
});

test("the rail and the sticky head agree on the current section", async ({ page }) => {
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac");
  const contents = page.getByRole("navigation", { name: "Page sections" });
  const blacksmithing = page.getByRole("region", { exact: true, name: "Blacksmithing" });
  await expect(blacksmithing.getByRole("button", { name: /^Check / }).first()).toBeVisible();
  // Blacksmithing's head sits above the old 30% reading line but hasn't reached the sticky line,
  // so Artifacts' head is the one still stuck at the top.
  await blacksmithing.evaluate((section) => {
    const header = document.querySelector<HTMLElement>("[data-page-header]");
    const target = (header?.offsetHeight ?? 0) + 150;
    globalThis.scrollBy(0, section.getBoundingClientRect().top - target);
  });
  await expect(contents.getByRole("link", { exact: true, name: "Artifacts" })).toHaveAttribute(
    "aria-current",
    "location",
  );
});

test("column heads stick below the section head's measured height at book widths", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 1100 });
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const row = furniture.getByRole("button", { name: /^Check / }).nth(40);
  await row.evaluate((button) => {
    button.scrollIntoView({ block: "center" });
  });
  await expect
    .poll(() =>
      furniture.evaluate((section) => {
        const head = section.querySelector("[data-ledger-head]")?.getBoundingClientRect();
        const table = section.querySelector(".timetable")?.getBoundingClientRect();
        return head && table ? Math.round(table.top - head.bottom) : undefined;
      }),
    )
    .toBeGreaterThanOrEqual(0);
});

test("Back returns opened lines as they were left, and a fresh visit starts closed", async ({
  page,
}) => {
  await initializeApplication(
    page,
    "light",
    createStoredState({ progress: { almanac: lateGameAlmanac() } }),
  );
  await gotoApplication(page, "/almanac");
  const bugs = page.getByRole("region", { exact: true, name: "Bugs" });
  const bugsHead = bugs.getByRole("button", { exact: true, name: "Bugs" });
  const ant = bugs.getByRole("button", { exact: true, name: "Uncheck Ant" });
  const thumbIndex = page.getByRole("navigation", { name: "Thumb index" });
  const contents = page.getByRole("navigation", { name: "Page sections" });

  await bugsHead.click();
  await expect(ant).toBeVisible();
  // A hash link starts a new history entry; the opened line stays open across it.
  await contents.getByRole("link", { exact: true, name: "Furniture" }).click();
  await expect(page).toHaveURL(/#furniture$/u);
  await expect(bugsHead).toHaveAttribute("aria-expanded", "true");

  await thumbIndex.getByRole("link", { name: "Museum" }).click();
  await expect(page).toHaveURL(/\/museum/u);
  await page.goBack();
  await expect(bugsHead).toHaveAttribute("aria-expanded", "true");
  // The finished section's rows come back too, not a closed Completed fold.
  await expect(ant).toBeAttached();
  await ant.scrollIntoViewIfNeeded();
  await expect(ant).toBeVisible();

  await thumbIndex.getByRole("link", { name: "Museum" }).click();
  await expect(page).toHaveURL(/\/museum/u);
  await thumbIndex.getByRole("link", { name: "Almanac" }).click();
  await expect(page).toHaveURL(/\/almanac$/u);
  await expect(bugsHead).toHaveAttribute("aria-expanded", "false");
});

/** A field guide fixture's checked Almanac items. */
function fixtureAlmanac(preset: "day-one" | "late-game" | "mid-game"): string[] {
  const fixtures = JSON.parse(
    readFileSync(
      new URL("../../scripts/fixtures/field-guide-progress.json", import.meta.url),
      "utf8",
    ),
  ) as Record<typeof preset, { progress: { almanac: string[] } }>;
  return fixtures[preset].progress.almanac;
}

test("a short variant fits next to its name", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await initializeApplication(
    page,
    "light",
    createStoredState({ progress: { almanac: fixtureAlmanac("mid-game") } }),
  );
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  // oxlint-disable-next-line playwright/no-raw-locators -- Variant geometry lives inside the item label.
  const variants = furniture.locator('[data-shelf="todo"] .item small');
  await expect(variants.first()).toBeAttached();
  const short = await variants.evaluateAll((elements) =>
    elements.findIndex((element) => {
      const nameLength = element.previousElementSibling?.textContent.length ?? 100;
      return nameLength + element.textContent.length < 20;
    }),
  );
  expect(short).toBeGreaterThanOrEqual(0);
  const variant = variants.nth(short);
  await variant.scrollIntoViewIfNeeded();
  const geometry = await variant.evaluate(async (element) => {
    await document.fonts.ready;
    const name = element.previousElementSibling;
    const item = element.closest(".item");
    if (!name || !item) throw new Error("Expected the variant next to its name");
    const text = document.createRange();
    text.selectNodeContents(name);
    const nameRects = [...text.getClientRects()];
    const nameWidth = nameRects.reduce((width, rect) => width + rect.width, 0);
    const variantRect = element.getBoundingClientRect();
    return {
      available: item.getBoundingClientRect().width - 24,
      needed: nameWidth + variantRect.width + 8,
      offset: Math.abs(variantRect.top - (nameRects[0]?.top ?? -100)),
    };
  });
  expect(geometry.available).toBeGreaterThanOrEqual(geometry.needed);
  expect(geometry.offset).toBeLessThan(8);
});

test("a row whose source cells are blank still says where to get it", async ({ page }) => {
  await initializeApplication(
    page,
    "light",
    createStoredState({ progress: { almanac: fixtureAlmanac("mid-game") } }),
  );
  await gotoApplication(page, "/almanac#furniture");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  // Wait for the idle chunks, so every To do row is on the page.
  // oxlint-disable-next-line playwright/no-raw-locators -- Count mounted rows across shelves.
  await expect.poll(() => furniture.locator("[data-ledger-fact]").count()).toBeGreaterThan(1000);
  const audit = await furniture.evaluate((section) => {
    const rows = [...section.querySelectorAll('[data-shelf="todo"] [data-ledger-row]')];
    const blankCells = rows.filter((row) =>
      [...row.querySelectorAll(".cell")].every(
        (cell) => !cell.textContent.trim() && !cell.querySelector("svg"),
      ),
    );
    const silent = blankCells.filter((row) => !row.querySelector(".also, .where"));
    return {
      blank: blankCells.length,
      silent: silent.map((row) => row.textContent.trim()),
    };
  });
  expect(audit.blank).toBeGreaterThan(0);
  expect(audit.silent).toEqual([]);

  // A single source its cell already prints leaves nothing for the sheet, so the row doesn't open.
  const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
  // oxlint-disable-next-line playwright/no-raw-locators -- rows are layout boxes keyed by fact
  const amphora = artifacts.locator('[data-ledger-fact="almanac/clay_amphora"]');
  await expect(amphora).toContainText("Dig up at an artifact dig site");
  await expect(amphora.getByRole("button", { exact: true, name: "Clay Amphora" })).toHaveCount(0);

  // The checkbox takes the page's 2 px focus ring.
  await amphora.getByRole("button", { name: "Check Clay Amphora" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      amphora
        .getByRole("button", { name: "Check Clay Amphora" })
        .evaluate((button) => getComputedStyle(button).outlineWidth),
    )
    .toBe("2px");
});

test.describe("Almanac rows on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { height: 844, width: 390 } });

  test("rows name their first source, and spoilered rows gather at the shelf's foot", async ({
    page,
  }) => {
    await initializeApplication(
      page,
      "light",
      createStoredState({ progress: { almanac: fixtureAlmanac("day-one") } }),
    );
    await gotoApplication(page, "/almanac#artifacts");
    const artifacts = page.getByRole("region", { exact: true, name: "Artifacts" });
    // oxlint-disable-next-line playwright/no-raw-locators -- rows are layout boxes keyed by fact
    const amphora = artifacts.locator('[data-ledger-fact="almanac/clay_amphora"]');
    await expect(amphora).toContainText("Dig up at an artifact dig site");

    await gotoApplication(page, "/almanac#furniture");
    const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
    await furniture.getByText("Not now", { exact: true }).click();
    const readOrder = () =>
      furniture.evaluate((section) =>
        [...section.querySelectorAll('[data-shelf="notNow"] [data-ledger-row]')].map((row) =>
          row.querySelector(".spoiler-cover") ? "covered" : "plain",
        ),
      );
    // The shelf's rows mount in idle chunks, so wait for the covered ones to arrive.
    await expect.poll(readOrder).toContain("covered");
    const order = await readOrder();
    expect(order.indexOf("covered")).toBeGreaterThan(order.lastIndexOf("plain"));
  });
});
