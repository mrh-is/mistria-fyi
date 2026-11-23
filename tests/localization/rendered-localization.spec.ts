import { accessibilityRoutes } from "../accessibility/routes.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
} from "../accessibility/support/application-state.js";
import { expect, test } from "../browser/test.js";
import { findUnexpectedLatin } from "./allowed-latin.js";
import { collectRenderedCopy } from "./rendered-copy.js";

import type { Page } from "@playwright/test";

const locales = ["ja", "ru"] as const;
type Locale = (typeof locales)[number];

async function gotoLocalized(page: Page, locale: Locale, path = "/"): Promise<void> {
  const url = path === "/" ? `/${locale}` : `/${locale}${path}`;
  const response = await gotoApplication(page, url);
  expect(response?.ok(), url).toBe(true);
  expect(new URL(page.url()).pathname).toBe(url);
  // oxlint-disable-next-line playwright/no-raw-locators -- the document language lives on html
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

async function expectLocalizedCopy(page: Page, state: string): Promise<void> {
  const path = new URL(page.url()).pathname;
  const copy = await collectRenderedCopy(page);
  expect(
    copy.some(({ text }) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Cyrillic}]/u.test(text)),
    "The scan must see localized content",
  ).toBe(true);
  let buildVersion: string | undefined;
  if (path.endsWith("/data")) {
    const response = await page.request.get("/_app/version.json");
    await expect(response).toBeOK();
    const manifest: unknown = await response.json();
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      !("version" in manifest) ||
      typeof manifest.version !== "string" ||
      !manifest.version.trim()
    ) {
      throw new Error("Missing build version in /_app/version.json");
    }
    buildVersion = manifest.version;
  }
  const hasUnexpectedLatin = findUnexpectedLatin(path, buildVersion);
  const leaks = copy
    .filter(({ text }) => hasUnexpectedLatin(text))
    .map(({ source, text }) => `${source}: ${text}`);
  expect([...new Set(leaks)].toSorted(), `${path} · ${state}`).toEqual([]);
}

function panelTrigger(page: Page, id: string) {
  // oxlint-disable-next-line playwright/no-raw-locators -- the ID relationship identifies a panel independently of its translated label
  return page.getByRole("button").and(page.locator(`[aria-controls="${id}"]`));
}

for (const locale of locales) {
  test.describe(locale, () => {
    test.use({ reducedMotion: "reduce" });

    for (const { path } of accessibilityRoutes) {
      test(`route ${path}`, async ({ page }) => {
        await initializeApplication(page, "light");
        await gotoLocalized(page, locale, path);
        await expectLocalizedCopy(page, "initial route");
      });
    }

    test("quick settings", async ({ page }) => {
      await initializeApplication(page, "light", createStoredState());
      await gotoLocalized(page, locale);
      await panelTrigger(page, "quick-settings-panel").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectLocalizedCopy(page, "quick settings");
    });

    test("show spoilers confirmation", async ({ page }) => {
      await initializeApplication(page, "light", createStoredState());
      await gotoLocalized(page, locale);
      await panelTrigger(page, "quick-settings-panel").click();
      await page.getByRole("dialog").getByRole("switch").click();
      await expect(
        page.getByRole("dialog", {
          exact: true,
          name: locale === "ja" ? "ネタバレを表示しますか？" : "Показывать спойлеры?",
        }),
      ).toBeVisible();
      await expectLocalizedCopy(page, "show spoilers confirmation");
    });

    test("mine progression spoiler confirmation", async ({ page }) => {
      await initializeApplication(page, "light", createStoredState());
      await gotoLocalized(page, locale, "/mines");
      const floor = page.getByRole("spinbutton");
      await floor.fill("21");
      await floor.press("Tab");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectLocalizedCopy(page, "mine progression spoiler confirmation");
    });

    test("feedback with a recoverable validation error", async ({ page }) => {
      await initializeApplication(page, "light", createStoredState());
      await gotoLocalized(page, locale);
      await page
        .getByRole("button", {
          exact: true,
          name: locale === "ja" ? "フィードバックを送信" : "Отправить отзыв",
        })
        .click();
      // oxlint-disable-next-line playwright/no-raw-locators -- the panel ID is the toolbar control's target in every locale
      const feedback = page.locator("#feedback-panel");
      const message = feedback.getByRole("textbox");
      await expect(message).toBeVisible();
      const send = feedback.getByRole("button", {
        exact: true,
        name: locale === "ja" ? "送信" : "Отправить",
      });
      await send.click();
      const error = feedback.getByRole("alert");
      await expect(error).toBeVisible();
      await expectLocalizedCopy(page, "feedback validation error");
      await message.fill(locale === "ja" ? "ありがとう" : "Спасибо");
      await expect(error).toBeHidden();
    });

    test("search with no results", async ({ page }) => {
      await initializeApplication(page, "light", createStoredState());
      await gotoLocalized(page, locale);
      // oxlint-disable-next-line playwright/no-raw-locators -- the toolbar marks the search trigger independently of its label
      await page.locator("[data-toolbar-search-trigger]").click();
      await page.getByRole("textbox").fill("98765432109876543210");
      // oxlint-disable-next-line playwright/no-raw-locators -- wait for the rendered empty state, independent of its translated wording
      await expect(page.locator(".search-results__empty")).toBeVisible();
      await expectLocalizedCopy(page, "empty search");
    });

    test("sync status", async ({ page }) => {
      const state = createStoredState();
      state.progress.local = { syncLane: { kind: "computer" }, trackingLane: "sync" };
      await initializeApplication(page, "light", state);
      await gotoLocalized(page, locale);
      await panelTrigger(page, "sync-status-panel").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectLocalizedCopy(page, "computer sync status");
    });
  });
}
