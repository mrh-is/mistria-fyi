import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { localeNameChunks } from "../../src/lib/build/locale-name-chunks";

import type { Manifest } from "vite";

const CLIENT_OUTPUT = ".svelte-kit/output/client";
/** Per-locale gzipped name data; see docs/pwa-verification.md#byte-budget. */
const MAX_LOCALE_GZIP_BYTES = 100_000;

/**
 * The name chunks of the build being served. Read inside each test, not at import: Playwright
 * imports spec files to list them before its web server has run the build.
 */
function builtChunks(): Record<string, string[]> {
  return localeNameChunks(
    JSON.parse(readFileSync(`${CLIENT_OUTPUT}/.vite/manifest.json`, "utf-8")) as Manifest,
  );
}

function cachedPaths(page: Page, paths: readonly string[]): Promise<string[]> {
  return page.evaluate(async (candidates) => {
    const cached = await Promise.all(
      candidates.map(async (path) => ((await caches.match(path)) ? path : undefined)),
    );
    return cached.filter((path): path is string => path !== undefined);
  }, paths);
}

async function waitForControl(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        resolve();
      });
    });
  });
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument.
test("keeps each locale's name data within the byte budget", ({}, testInfo) => {
  const sizes = Object.entries(builtChunks()).map(([locale, paths]) => ({
    gzip: paths.reduce(
      (total, path) => total + gzipSync(readFileSync(`${CLIENT_OUTPUT}${path}`)).length,
      0,
    ),
    locale,
  }));
  const total = sizes.reduce((sum, { gzip }) => sum + gzip, 0);
  testInfo.annotations.push({
    type: "locale name gzip bytes",
    description: `${sizes.map(({ gzip, locale }) => `${locale} ${String(gzip)}`).join(", ")}; all ${String(total)} (none precached)`,
  });

  expect(sizes).toHaveLength(8);
  for (const { gzip, locale } of sizes) {
    expect(gzip, locale).toBeLessThanOrEqual(MAX_LOCALE_GZIP_BYTES);
  }
});

test("keeps the visited locale offline and leaves other locales to download on demand", async ({
  context,
  page,
}) => {
  const { en: enChunks = [], ja: jaChunks = [] } = builtChunks();
  expect(enChunks.length).toBeGreaterThan(0);
  expect(jaChunks.length).toBeGreaterThan(0);

  await page.goto("/en");
  await waitForControl(page);

  // Every English chunk arrives without being requested by a page; no Japanese chunk does.
  await expect.poll(() => cachedPaths(page, enChunks), { timeout: 15_000 }).toEqual(enChunks);
  expect(await cachedPaths(page, jaChunks)).toEqual([]);

  await context.setOffline(true);

  // A category this session never opened still renders its names offline.
  await page.locator('a[href="/en/recipes"]').first().click();
  await expect(page).toHaveURL(/\/en\/recipes$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Sitewide search loads every category's names on first open.
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("textbox", { name: "Search items" }).fill("turnip");
  await expect(page.getByRole("status").filter({ hasText: /\d+ results?/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // An undownloaded locale explains itself instead of navigating to a broken page.
  await page.getByRole("button", { name: "Quick settings" }).click();
  await page.getByRole("button", { name: "Choose language" }).click();
  await page.getByRole("button", { name: "日本語 Beta translation" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Go online to download the Japanese text, then try again.",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/en\/recipes$/);
});
