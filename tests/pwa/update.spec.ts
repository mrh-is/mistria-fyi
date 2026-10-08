import { readFileSync, writeFileSync } from "node:fs";

import { expect, test } from "../browser/test.js";
import { waitForControl } from "./service-worker.js";

import type { Page } from "@playwright/test";

const WORKER_PATH = ".svelte-kit/output/client/service-worker.js";
const UPDATE_MESSAGE =
  "The Mistria Field Guide has been updated! Refresh to get the newest version.";

function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}

/**
 * Simulates a deploy by rewriting the built worker's version, which names its cache. The preview
 * server records each file's size at startup and sends it as `Content-Length`, so the new version
 * must keep the byte length: this swaps the version's last letter or digit.
 */
function deployNewVersion(version: string): { newVersion: string; restore: () => void } {
  const original = readFileSync(WORKER_PATH, "utf8");
  const newVersion = version.replace(/\w(?=\W*$)/, (last) => (last === "x" ? "y" : "x"));
  const updated = original.replaceAll(version, newVersion);
  if (updated === original) throw new Error(`The built worker doesn't contain "${version}"`);
  writeFileSync(WORKER_PATH, updated);
  return {
    newVersion,
    restore: () => {
      writeFileSync(WORKER_PATH, original);
    },
  };
}

test("keeps open tabs on their version until one accepts the update, then reloads them all", async ({
  context,
  page,
}) => {
  await page.goto("/en");
  await waitForControl(page);
  const otherTab = await context.newPage();
  await otherTab.goto("/en/animals");
  await waitForControl(otherTab);

  const initialCacheNames = await cacheNames(page);
  const oldCache = initialCacheNames.find((name) => name.startsWith("cache-"));
  if (!oldCache) throw new Error("The service worker has no versioned cache");
  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;

  try {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });

    // The new version installs and waits; both tabs offer it.
    await expect(page.getByText(UPDATE_MESSAGE)).toBeVisible();
    await expect(otherTab.getByText(UPDATE_MESSAGE)).toBeVisible();
    expect(await cacheNames(page)).toEqual(expect.arrayContaining([oldCache, newCache]));

    // Until a tab accepts, the old version keeps working, cache and all.
    await page
      .getByRole("link", { name: /^Recipes/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/recipes$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await cacheNames(page)).toContain(oldCache);

    // Dismissing the prompt in one tab doesn't keep that tab off the update another tab accepts.
    await otherTab.getByRole("button", { name: "Not now" }).click();
    await expect(otherTab.getByText(UPDATE_MESSAGE)).toBeHidden();

    const reloads = Promise.all([page.waitForEvent("load"), otherTab.waitForEvent("load")]);
    await page.getByRole("button", { name: "Refresh" }).click();
    await reloads;

    for (const tab of [page, otherTab]) {
      await waitForControl(tab);
      await expect(tab.getByText(UPDATE_MESSAGE)).toBeHidden();
    }
    const noWaitingWorker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.waiting === null;
    });
    expect(noWaitingWorker).toBe(true);
    const caches = await cacheNames(page);
    expect(caches).toContain(newCache);
    expect(caches).not.toContain(oldCache);
  } finally {
    restore();
  }
});
