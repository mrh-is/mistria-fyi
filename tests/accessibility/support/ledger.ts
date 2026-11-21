import type { Locator, Page } from "@playwright/test";

/*
 * Every ledger row sets `content-visibility: auto`, so Chromium skips styling the rows offscreen. A
 * `getByRole("button")` query inside a ledger reads each candidate's computed style, which makes
 * Chromium style every skipped row first. On the Almanac the first such query took about 10 seconds
 * at 4× CPU throttling. Under CI's parallel workers it stalled the page long enough to time out
 * clicks & navigations (#708). These helpers find ledger buttons by their labels, which reads no
 * styles. A role query scoped to one row, heading, toolbar, or dialog stays fast.
 */

/** Matches what `getByRole` skips: `hidden` & closed folds, & what's hidden from assistive tech. */
const shown = ":not([hidden], [hidden] *, details:not([open]) *, [aria-hidden='true'] *)";

/** A row the reader can see: shown, & not hidden by the current search. */
const shownRow = `[data-ledger-row]${shown}:not([data-ledger-searching] [data-ledger-search-miss])`;

const label = (text: string) => JSON.stringify(text);

/** The check buttons on shown rows, skipping covered spoilers. */
export function ledgerChecks(scope: Locator | Page): Locator {
  // oxlint-disable-next-line playwright/no-raw-locators -- a role query styles every skipped row
  return scope.locator(
    `${shownRow} button[aria-label^="Check "]:not([aria-label="Check spoilered item"])`,
  );
}

/**
 * The buttons on shown rows whose labels start with `prefix`, such as “Uncheck ” or “Check ”. Unlike
 * `ledgerChecks`, “Check ” also finds covered spoilers.
 */
export function ledgerButtonsStartingWith(scope: Locator | Page, prefix: string): Locator {
  // oxlint-disable-next-line playwright/no-raw-locators -- a role query styles every skipped row
  return scope.locator(`${shownRow} button[aria-label^=${label(prefix)}]`);
}

/**
 * The button on shown rows with exactly this label, such as “Check Basic Doormat”. Unlike a role
 * query, it matches the raw `aria-label` without normalizing whitespace.
 */
export function ledgerButton(scope: Locator | Page, text: string): Locator {
  // oxlint-disable-next-line playwright/no-raw-locators -- a role query styles every skipped row
  return scope.locator(`${shownRow} button[aria-label=${label(text)}]`);
}

/**
 * The shown row for an item, found by its check button, so a role query for its other buttons
 * reads only that row.
 */
export function ledgerRow(scope: Locator | Page, item: string): Locator {
  // oxlint-disable-next-line playwright/no-raw-locators -- a role query styles every skipped row
  return scope.locator(
    `${shownRow}:has(button[aria-label=${label(`Check ${item}`)}], button[aria-label=${label(`Uncheck ${item}`)}])`,
  );
}

/** A shown column-head button in a ledger timetable, such as “Highlight rows from Chests”. */
export function ledgerColumnHead(scope: Locator | Page, text: string): Locator {
  // oxlint-disable-next-line playwright/no-raw-locators -- a role query styles every skipped row
  return scope.locator(`.timetable button[aria-label=${label(text)}]${shown}`);
}

/**
 * The head button of a ledger section, or of a place on Everything’s source ledger. Region &
 * heading queries stay fast, since few elements have those roles, and the button query then reads
 * only the heading.
 */
export function sectionTrigger(scope: Locator | Page, name: string): Locator {
  return scope
    .getByRole("region", { exact: true, name })
    .getByRole("heading")
    .getByRole("button", { exact: true, name });
}

/** The head button inside a section region you already hold. */
export function headTrigger(section: Locator, name: string): Locator {
  return section.getByRole("heading").getByRole("button", { exact: true, name });
}
