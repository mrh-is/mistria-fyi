import { expect } from "@playwright/test";

import { gotoRenderedApplication } from "./application-state.js";

import type { Locator, Page } from "@playwright/test";

export async function openFeedbackValidation(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { exact: true, name: "Send feedback" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const dialog = page.getByRole("dialog", { name: "Send feedback" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { exact: true, name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("What did you wanna say?");
}

export async function openSearch(page: Page, query: string): Promise<void> {
  const search = page.getByRole("textbox", { name: "Search items" });
  await search.fill(query);
  await expect(search).toHaveValue(query);
}

/** Ends a search the way a reader would: Escape in the always-present field. */
export async function closeSearch(page: Page): Promise<void> {
  const search = page.getByRole("textbox", { name: "Search items" });
  await search.press("Escape");
  await expect(search).toHaveValue("");
}

export async function openSettingsCard(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole("button", { name: new RegExp(`^${name}`) });
  await expect(trigger).toHaveAttribute("aria-controls", /\S+/);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

/** Opens the first closed fold of `shelf`, where a locked or finished row waits. */
export async function openShelf(page: Page, shelf: string): Promise<void> {
  await page.getByRole("button", { expanded: false, name: shelf }).first().click();
}

/** The category lens still uses the stacked paper cards during the ledger rollout. */
export async function openLegacyArtifacts(page: Page): Promise<void> {
  await gotoRenderedApplication(page, "/everything?group=category");
  await page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed/ }).click();
}

export async function openVisibilityPanel(page: Page): Promise<void> {
  // Scoped to the toolbar, since a page-wide button query is slow on Everything's large ledger.
  await page
    .getByRole("navigation", { name: "Field guide tools" })
    .getByRole("button", { name: "Visibility filters" })
    .click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
}

/** A villager's record card; the page anchors it by id, which has no role or accessible name. */
export function villagerRecord(page: Page, villagerId: string): Locator {
  return page.locator(`#villager-${villagerId}`);
}

/** The villager record card whose id starts with `prefix` and currently holds focus. */
export function focusedVillagerRecord(page: Page, prefix: string): Locator {
  return page.locator(`[id^="villager-${prefix}"]:focus`);
}

/** Visit each screen of a shelf in order, including rows already mounted just outside the view. */
export async function visitLedgerShelf(
  section: Locator,
  shelf: "notNow" | "todo",
  visit: (shelf: Locator) => Promise<void>,
): Promise<void> {
  // oxlint-disable-next-line playwright/no-raw-locators -- The shelf itself can be a layout box.
  const box = section.locator(`[data-shelf="${shelf}"]`);
  const page = section.page();
  await box.evaluate((element) => {
    element.scrollIntoView({ block: "start" });
  });
  // oxlint-disable-next-line no-await-in-loop -- Read each mounted window before scrolling to the next.
  for (;;) {
    await settleLayout(page);
    await visit(box);
    // oxlint-disable-next-line no-await-in-loop -- Stop after reading the last screen of the shelf.
    const bottom = await box.evaluate((element) => element.getBoundingClientRect().bottom);
    if (bottom <= (await page.evaluate(() => globalThis.innerHeight))) return;
    await page.evaluate(() => {
      globalThis.scrollBy({ behavior: "instant", top: globalThis.innerHeight * 0.8 });
    });
  }
}

/** Waits two frames, so rows near the screen replace their size estimates with real heights. */
export async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** Scrolls a ledger section's head to the top, so its first rows mount as a reader's would. */
export async function scrollToSection(section: Locator): Promise<void> {
  await section.evaluate((element) => {
    element.scrollIntoView({ block: "start" });
  });
  // oxlint-disable-next-line playwright/no-raw-locators -- Wait for the section's first row box.
  await expect(section.locator("[data-ledger-fact]").first()).toBeAttached();
  await settleLayout(section.page());
}
