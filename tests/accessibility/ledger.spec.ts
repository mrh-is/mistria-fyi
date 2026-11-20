import { readFileSync } from "node:fs";

import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { closeSearch, openSearch, openVisibilityPanel } from "./support/scenarios.js";

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
      const undo = page.getByRole("button", { exact: true, name: "Undo" });
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
  const rows = furniture.getByRole("button", { name: /^Check (?!spoilered item)/ });
  const distantRow = rows.nth(50);
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
  const clock = page.getByRole("button", { name: /^Season & weather/ });
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
  await page.getByRole("button", { name: "Refresh shelves" }).click();
  await expect(page.getByText("Your progress or the day changed.")).toHaveCount(0);

  await contents.evaluate((nav) => {
    nav.parentElement?.style.setProperty("--ledger-anchor-offset", "12rem");
  });
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

test("Back and clearing a zero-match search restore the Furniture row", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/almanac");
  const furniture = page.getByRole("region", { exact: true, name: "Furniture" });
  const check = furniture.getByRole("button", { name: /^Check (?!spoilered item)/ }).nth(20);
  const label = (await check.getAttribute("aria-label")) ?? "";
  const row = furniture.getByRole("button", { exact: true, name: label });
  const position = () => row.evaluate((element) => element.getBoundingClientRect().top);
  await row.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });
  const top = await position();

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/en\/?$/u);
  await page.goBack();
  await expect(row).toBeInViewport();
  await expect.poll(async () => Math.abs((await position()) - top)).toBeLessThan(8);

  await openSearch(page, "zzq-no-matching-furniture");
  await expect(page.getByRole("status").filter({ hasText: "No items found" })).toHaveCount(1);
  await closeSearch(page);
  await expect.poll(async () => Math.abs((await position()) - top)).toBeLessThan(8);
  await expect(page.getByRole("textbox", { name: "Search items" })).toBeFocused();
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

test("closed source names are findable and native reveal opens the matching row", async ({
  page,
}) => {
  // The browser first builds the searchable titles for the whole source ledger.
  test.slow();
  await initializeApplication(page, "light", createStoredState());
  await gotoApplication(page, "/everything?group=source");
  const balor = page.getByRole("button", { exact: true, name: "Balor's Wagon" });
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
  await expect(
    page.getByRole("button", { exact: true, name: "Check Barrel Hat" }),
  ).toBeInViewport();
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
    // A variant shares its name's line when there's room.
    const small = rows.map((row) => row.querySelector(".item small")).find(Boolean);
    small?.scrollIntoView({ block: "center" });
    const nameTop = small?.previousElementSibling?.getBoundingClientRect().top ?? 0;
    const variantTop = small?.getBoundingClientRect().top ?? 100;
    return {
      blank: blankCells.length,
      silent: silent.map((row) => row.textContent.trim()),
      variantOffset: Math.abs(nameTop - variantTop),
    };
  });
  expect(audit.blank).toBeGreaterThan(0);
  expect(audit.silent).toEqual([]);
  expect(audit.variantOffset).toBeLessThan(8);

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
    const order = await furniture.evaluate((section) =>
      [...section.querySelectorAll('[data-shelf="notNow"] [data-ledger-row]')].map((row) =>
        row.querySelector(".spoiler-cover") ? "covered" : "plain",
      ),
    );
    expect(order).toContain("covered");
    expect(order.indexOf("covered")).toBeGreaterThan(order.lastIndexOf("plain"));
  });
});
