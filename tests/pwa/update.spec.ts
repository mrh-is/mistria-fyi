import { readFileSync, writeFileSync } from "node:fs";

import { expect, test } from "../browser/test.js";
import { goOffline, goOnline, waitForControl } from "./service-worker.js";

import type { BrowserContext, Page } from "@playwright/test";

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

  // The page reports its language, which the next version's install reads.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const record = await caches.match("/__last-locale");
        return record?.json() as Promise<unknown>;
      }),
    )
    .toBe("en");

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
    // Activating deletes the old cache, so the install fetched the last-used home page itself, for
    // an offline launch right after the update (#728).
    const homeInNewCache: boolean = await page.evaluate(async (name) => {
      const cache = await caches.open(name);
      const home = await cache.match("/en");
      return home !== undefined;
    }, newCache);
    expect(homeInNewCache).toBe(true);

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
    const finalCacheNames = await cacheNames(page);
    expect(finalCacheNames).toContain(newCache);
    expect(finalCacheNames).not.toContain(oldCache);
  } finally {
    restore();
  }
});

function isEnglishHome(url: URL): boolean {
  return url.pathname === "/en";
}

function cacheHolds(page: Page, cacheName: string, path: string): Promise<boolean> {
  return page.evaluate(
    async ([name, key]) => {
      const cache = await caches.open(name);
      return (await cache.match(key)) !== undefined;
    },
    [cacheName, path],
  );
}

/**
 * Waits for the new version to take over with no tab open. Chromium activates it only once the
 * closed tab has gone, as iOS's launch after a force-quit would. A worker restarting mid-check just
 * reads again.
 */
async function waitForTakeover(context: BrowserContext, newCache: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        return await context
          .serviceWorkers()
          .at(-1)
          ?.evaluate(async (name) => {
            const { registration } = globalThis as unknown as {
              registration: ServiceWorkerRegistration;
            };
            const names = await caches.keys();
            return (
              registration.active?.state === "activated" &&
              registration.waiting === null &&
              names.includes(name)
            );
          }, newCache);
      } catch {
        return false;
      }
    })
    .toBe(true);
}

async function waitForWaiting(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return registration.waiting !== null;
      }),
    )
    .toBe(true);
}

function lastLocale(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const record = await caches.match("/__last-locale");
    return record?.json() as Promise<unknown>;
  });
}

// A new version reads the last-used locale partway through its install. A language switch after
// that read, but before the install finishes, must still reach it: activating deletes the old
// version's cache, and the next launch may be offline (#18).
test("relaunches offline in a language chosen while a new version was installing", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await waitForControl(page);
  await expect.poll(() => lastLocale(page)).toBe("en");

  const initialNames = await cacheNames(page);
  const oldCache = initialNames.find((name) => name.startsWith("cache-"));
  if (!oldCache) throw new Error("The service worker has no versioned cache");
  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;

  // The new version fetches the English home page right after reading the last-used locale. Hold
  // that fetch until the switch below has happened.
  const { promise: homeHeld, resolve: releaseHome } = Promise.withResolvers<boolean>();
  const { promise: localeRead, resolve: homeRequested } = Promise.withResolvers<boolean>();
  await context.route(isEnglishHome, async (route) => {
    homeRequested(true);
    await homeHeld;
    await route.continue();
  });

  try {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      void registration.update();
    });
    await localeRead;

    await page.getByRole("button", { name: "Quick settings" }).click();
    await page.getByRole("button", { name: "Choose language" }).click();
    await page.getByRole("button", { name: /^日本語/ }).click();
    await expect(page).toHaveURL(/\/ja$/);
    await expect.poll(() => lastLocale(page)).toBe("ja");

    releaseHome(true);
    await waitForWaiting(page);
    await context.unroute(isEnglishHome);
    // The switch reached the installing version itself, not only the active one. Waited for before
    // going offline: the new version's own fetch may still be in flight.
    await expect.poll(() => cacheHolds(page, newCache, "/ja")).toBe(true);

    // Force-quit and go offline: the new version takes over with nothing open, and it can't fetch
    // what it's missing.
    await goOffline(context);
    await page.close();
    await waitForTakeover(context, newCache);
    const relaunched = await context.newPage();
    await relaunched.goto("/");
    await expect(relaunched).toHaveURL(/\/ja$/);
    await expect(relaunched.getByRole("main")).toBeVisible();
  } finally {
    restore();
  }
});

// The new version's own fetch of the last-used home page can fail (a dropped connection or a 5xx
// mid-deploy) without failing its install. Activating must not then delete the old version's cache,
// which holds the only copy of that page.
test("relaunches offline after a new version failed to fetch the last-used home page", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await waitForControl(page);
  await expect.poll(() => lastLocale(page)).toBe("en");
  const initialNames = await cacheNames(page);
  const oldCache = initialNames.find((name) => name.startsWith("cache-"));
  if (!oldCache) throw new Error("The service worker has no versioned cache");
  await expect.poll(() => cacheHolds(page, oldCache, "/en")).toBe(true);

  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;
  await context.route(isEnglishHome, (route) =>
    route.fulfill({ body: "Unavailable", status: 503 }),
  );

  try {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      void registration.update();
    });
    await waitForWaiting(page);
    expect(await cacheHolds(page, newCache, "/en")).toBe(false);

    await goOffline(context);
    await page.close();
    await waitForTakeover(context, newCache);
    const relaunched = await context.newPage();
    await relaunched.goto("/");
    await expect(relaunched).toHaveURL(/\/en$/);
    await expect(relaunched.getByRole("main")).toBeVisible();
    await expect(relaunched.getByRole("heading", { name: /offline/i })).toBeHidden();
    expect(await cacheNames(relaunched)).toContain(oldCache);

    // Back online, the next load's message caches the home page in the new version, and the old
    // version's cache goes.
    await context.unroute(isEnglishHome);
    await goOnline(context);
    await relaunched.reload();
    await waitForControl(relaunched);
    await expect.poll(() => cacheHolds(relaunched, newCache, "/en")).toBe(true);
    await expect.poll(() => cacheNames(relaunched)).not.toContain(oldCache);
  } finally {
    restore();
  }
});
