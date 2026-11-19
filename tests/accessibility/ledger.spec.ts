import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "./support/application-state.js";
import { openSearch, openVisibilityPanel } from "./support/scenarios.js";

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
      if (touch) expect(rowHeight).toBeGreaterThanOrEqual(48);
      else expect(rowHeight).toBeLessThan(48);
      await (touch ? checkItem.tap() : checkItem.click());

      await expect(uncheckItem).toBeVisible();
      await expect(shelfCount).toBeVisible();
      if (!touch) await expect(uncheckItem).toBeFocused();
      await page.getByRole("button", { exact: true, name: "Undo" }).click();
      await expect(checkItem).toBeVisible();

      await openSearch(page, name);
      await expect(checkItem).toBeVisible();
      await page.getByRole("button", { exact: true, name: "Cancel" }).click();
      await openVisibilityPanel(page);
      const filters = page.getByRole("dialog", { name: "Filters" });
      if (width < 701) await filters.getByRole("button", { name: /^Source types/ }).click();
      await filters.getByRole("button", { exact: true, name: "Stores" }).click();
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

  const songCrystals = contents.getByRole("link", { exact: true, name: "Song Crystals" });
  await songCrystals.click();
  await expect(page).toHaveURL(/#song_crystal$/u);
  await expect(songCrystals).toHaveAttribute("aria-current", "location");
  const crystals = page.getByRole("region", { exact: false, name: /^Song Crystals/ });
  await expect(
    crystals.getByRole("button", { exact: true, name: "Highlight rows from Chests" }),
  ).toBeVisible();
});

test("native reveal opens a closed source place and preserves the item title", async ({ page }) => {
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
