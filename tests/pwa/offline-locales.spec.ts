import { builtLocaleChunks } from "../../scripts/built-locale-chunks.js";
import { expect, test } from "../browser/test.js";
import { goOffline, waitForControl, waitForHydration } from "./service-worker.js";

import type { Page } from "@playwright/test";

function cachedPaths(page: Page, paths: readonly string[]): Promise<string[]> {
  return page.evaluate(async (candidates) => {
    const cached = await Promise.all(
      candidates.map(async (path) => ((await caches.match(path)) ? path : undefined)),
    );
    return cached.filter((path): path is string => path !== undefined);
  }, paths);
}

test("keeps the visited locale offline and leaves other locales to download on demand", async ({
  context,
  page,
}) => {
  const { en: enChunks = [], ja: jaChunks = [] } = builtLocaleChunks();
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

test("runs bilingual search and hydrates an unopened route offline", async ({ context, page }) => {
  await page.goto("/es");
  await waitForControl(page);
  await expect
    .poll(() => cachedPaths(page, ["/es/about"]), { timeout: 15_000 })
    .toEqual(["/es/about"]);

  await goOffline(context);
  await page.getByRole("button", { exact: true, name: "Buscar" }).click();
  await page.getByRole("textbox", { name: "Buscar elementos" }).fill("Request for a Turnip");
  await expect(page.getByRole("button", { name: "Marcar Encargo de nabo" })).toBeVisible();

  const response = await page.goto("/es/about");
  expect(response?.fromServiceWorker()).toBe(true);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { exact: true, name: "Datos" })).toBeVisible();
  await expect(page.getByText(/Los datos actuales de la guía se generaron/u)).toBeVisible();
});
