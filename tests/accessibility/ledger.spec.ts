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
  await expect(
    crystals.getByRole("button", { exact: true, name: "Highlight rows from Chests" }),
  ).toBeVisible();
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

  await furniture.getByText("Not now", { exact: true }).click();
  const notNowRow = furniture
    .getByRole("group")
    .getByRole("button", { name: /^Check / })
    .nth(5);
  await notNowRow.evaluate((row) => {
    row.scrollIntoView({ block: "center" });
  });
  await expect(head).toContainText("Not now");
});
