import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { LOCALE_CODES } from "../../src/lib/types/locale.js";
import { expect, test } from "../browser/test.js";
import { waitForControl } from "./service-worker.js";

import type { Page } from "@playwright/test";

const CLIENT_OUTPUT = ".svelte-kit/output/client";
/** Per-locale gzipped name data; see docs/pwa-verification.md#byte-budget. */
const MAX_LOCALE_GZIP_BYTES = 100_000;

/**
 * The per-locale name chunks inlined into the built service worker, so the spec checks the map the
 * worker actually received. Read inside each test, not at import: Playwright imports spec files to
 * list them before its web server has run the build. (The Vite manifest isn't an option: CI's
 * build artifact omits hidden directories like `.vite/`.)
 */
function builtChunks(): Record<string, string[]> {
  const worker = readFileSync(`${CLIENT_OUTPUT}/service-worker.js`, "utf8");
  return Object.fromEntries(
    LOCALE_CODES.map((locale) => {
      const list =
        new RegExp(`[{,]\\s*["']?${locale}["']?\\s*:\\s*\\[([^\\]]*)\\]`).exec(worker)?.[1] ?? "";
      return [locale, [...list.matchAll(/["'`]([^"'`]+)["'`]/g)].map(([, path]) => path)];
    }),
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

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument.
test("keeps each locale's name data within the byte budget", ({}, testInfo) => {
  const chunks = builtChunks();
  for (const [locale, paths] of Object.entries(chunks)) {
    expect(paths.length, `${locale} name chunks inlined into the service worker`).toBeGreaterThan(
      0,
    );
  }
  const sizes = Object.entries(chunks).map(([locale, paths]) => ({
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

  // Leave Japanese one chunk short of complete, as a download the network cut off would.
  const [, ...partialJaChunks] = jaChunks;
  await page.evaluate(async (paths) => {
    const cacheKeys = await caches.keys();
    const version = cacheKeys.find((name) => name.startsWith("cache-"));
    if (!version) throw new Error("The service worker has no versioned cache");
    const cache = await caches.open(version);
    await cache.addAll(paths);
  }, partialJaChunks);

  await context.setOffline(true);

  // A category this session never opened still renders its names offline.
  await page
    .getByRole("link", { name: /^Recipes/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/recipes$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Sitewide search, on the home page, loads every category's names on first open.
  await page.goBack();
  await expect(page).toHaveURL(/\/en$/);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("textbox", { name: "Search items" }).fill("turnip");
  await expect(page.getByRole("status").filter({ hasText: /\d+ results?/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // An incomplete locale explains itself instead of navigating to a broken page.
  await page.getByRole("button", { name: "Quick settings" }).click();
  await page.getByRole("button", { name: "Choose language" }).click();
  await page.getByRole("button", { name: "日本語 Beta translation" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Go online to download the Japanese text, then try again.",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/en$/);
});
