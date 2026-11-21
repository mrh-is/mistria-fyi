import type { Locator, Page } from "@playwright/test";

/*
 * Every ledger row sets `content-visibility: auto`, so Chromium skips styling the rows offscreen. A
 * `getByRole("button")` query inside a ledger reads each candidate's computed style, which makes
 * Chromium style every skipped row first. On the Almanac the first such query took about 10 seconds
 * at 4× CPU throttling. Under CI's parallel workers it stalled the page long enough to time out
 * clicks & navigations (#708). These helpers find ledger buttons by
 * their labels, which reads no styles. Toolbar & dialog controls aren't in the ledger, so a role
 * query scoped to them stays fast.
 */

/** A row the reader can see: not under a closed shelf, & not hidden by the current search. */
const shownRow =
  "[data-ledger-row]:not([hidden], [hidden] *, [data-ledger-searching] [data-ledger-search-miss])";

/** The check buttons on shown rows, skipping covered spoilers. */
export function ledgerChecks(scope: Locator | Page): Locator {
  // oxlint-disable-next-line playwright/no-raw-locators -- a role query styles every skipped row
  return scope.locator(
    `${shownRow} button[aria-label^="Check "]:not([aria-label="Check spoilered item"])`,
  );
}

/** The button on shown rows with exactly this label, such as “Check Basic Doormat”. */
export function ledgerButton(scope: Locator | Page, label: string): Locator {
  // oxlint-disable-next-line playwright/no-raw-locators -- a role query styles every skipped row
  return scope.locator(`${shownRow} button[aria-label=${JSON.stringify(label)}]`);
}

/**
 * The button that opens a place on Everything’s source ledger. Region & heading queries stay fast,
 * since few elements have those roles, and the button query then reads only the heading.
 */
export function placeTrigger(page: Page, name: string): Locator {
  return page
    .getByRole("region", { exact: true, name })
    .getByRole("heading")
    .getByRole("button", { exact: true, name });
}
