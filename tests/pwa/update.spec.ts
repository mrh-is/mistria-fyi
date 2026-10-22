import { readFileSync, writeFileSync } from "node:fs";

import { builtLocaleChunks } from "../../scripts/built-locale-chunks.js";
import { PRERENDERED_ROUTES } from "../../src/lib/i18n/prerender-entries.js";
import { expect, test } from "../browser/test.js";
import { goOffline, goOnline, waitForControl } from "./service-worker.js";

import type { BrowserContext, Page } from "@playwright/test";

const WORKER_PATH = ".svelte-kit/output/client/service-worker.js";
const VERSION_PATH = ".svelte-kit/output/client/_app/version.json";

function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}

/**
 * Simulates a deploy by rewriting the built worker's version, which names its cache. The preview
 * server records each file's size at startup and sends it as `Content-Length`, so the new version
 * must keep the byte length: this swaps the version's last letter or digit.
 *
 * Only the worker & version metadata change: the pages and their chunks are the same build, so a
 * page reloaded onto the new worker still reports the old version. {@link reportVersion} stands in
 * for a page built as the new version.
 */
function deployNewVersion(version: string): { newVersion: string; restore: () => void } {
  const original = readFileSync(WORKER_PATH, "utf8");
  const originalMetadata = readFileSync(VERSION_PATH, "utf8");
  const newVersion = version.replace(/\w(?=\W*$)/, (last) => (last === "x" ? "y" : "x"));
  const updated = original.replaceAll(version, newVersion);
  if (updated === original) throw new Error(`The built worker doesn't contain "${version}"`);
  writeFileSync(WORKER_PATH, updated);
  writeFileSync(VERSION_PATH, originalMetadata.replaceAll(version, newVersion));
  return {
    newVersion,
    restore: () => {
      writeFileSync(WORKER_PATH, original);
      writeFileSync(VERSION_PATH, originalMetadata);
    },
  };
}

/** The versions the worker has recorded for open pages, as the pages reported them. */
function reportedVersions(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open("client-versions-v1");
    const response = await cache.match("/__client-versions");
    const record = (await response?.json()) as Record<string, string> | undefined;
    return Object.values(record ?? {});
  });
}

/** Has `page` report `version` to the worker, as a page built as that version would. */
async function reportVersion(page: Page, version: string): Promise<void> {
  await page.evaluate((reported) => {
    navigator.serviceWorker.controller?.postMessage({
      type: "mfg:client-version",
      version: reported,
    });
  }, version);
}

function versionCacheOf(names: readonly string[]): string {
  const name = names.find((candidate) => candidate.startsWith("cache-"));
  if (!name) throw new Error("The service worker has no versioned cache");
  return name;
}

/** Marks the document, so a reload (which replaces it) shows as the mark's absence. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.dataset.beforeUpdate = "true";
  });
}

function stillSameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.dataset.beforeUpdate === "true");
}

test("keeps offline navigation to an unopened category working while an update waits", async ({
  context,
  page,
}) => {
  await page.goto("/en");
  await waitForControl(page);
  const oldCache = versionCacheOf(await cacheNames(page));
  const englishChunks = builtLocaleChunks().en;
  expect(englishChunks.length).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(async (paths) => {
        const cached = await Promise.all(paths.map((path) => caches.match(path)));
        return cached.every(Boolean);
      }, englishChunks),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Quick settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await markDocument(page);
  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  try {
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    await waitForTakeover(context, `cache-${newVersion}`);
    expect(await stillSameDocument(page)).toBe(true);

    await goOffline(context);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page
      .getByRole("link", { name: /^Recipes/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/recipes$/);
    await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
    expect(await stillSameDocument(page)).toBe(true);

    await page.goBack();
    await expect(page).toHaveURL(/\/en$/);
    expect(await stillSameDocument(page)).toBe(true);
    await page.goForward();
    await expect(page).toHaveURL(/\/en\/recipes$/);
    await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
    expect(await stillSameDocument(page)).toBe(true);

    const reloaded = page.waitForEvent("load");
    await goOnline(context);
    await reloaded;
    await waitForControl(page);
    expect(await stillSameDocument(page)).toBe(false);
    await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
  } finally {
    restore();
  }
});

test("activates a new version on its own, reloading idle tabs at once & a busy one when it's free", async ({
  context,
  page,
}) => {
  await page.clock.install();
  await page.goto("/en");
  await waitForControl(page);
  const busyTab = await context.newPage();
  await busyTab.goto("/en/about");
  await waitForControl(busyTab);
  // Each open page reports its version; the worker keeps that version's cache while one runs it.
  await expect.poll(() => reportedVersions(page).then((versions) => versions.length)).toBe(2);

  const oldCache = versionCacheOf(await cacheNames(page));
  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;

  try {
    // The busy tab has a dialog open, which an update must never interrupt.
    await busyTab.getByRole("button", { name: "AI disclosure" }).click();
    await expect(busyTab.getByRole("dialog")).toBeVisible();
    await markDocument(busyTab);

    // No focus or visibility event, and nobody accepts anything: the production poll detects the
    // deploy, the new version installs & takes over, and the idle tab reloads onto it.
    const idleReload = page.waitForEvent("load");
    await page.clock.runFor(600_001);
    await idleReload;
    await waitForControl(page);
    const takenOver = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.waiting === null && registration.active?.state === "activated";
    });
    expect(takenOver).toBe(true);
    const names = await cacheNames(page);
    // The busy tab still runs the old version, so its cache stays.
    expect(names).toEqual(expect.arrayContaining([oldCache, newCache]));
    const homeInNewCache = await page.evaluate(async (name) => {
      const cache = await caches.open(name);
      return (await cache.match("/en")) !== undefined;
    }, newCache);
    expect(homeInNewCache).toBe(true);

    // The busy tab stays put, dialog and all, past several of its safe-moment checks.
    await busyTab.waitForTimeout(2500);
    expect(await stillSameDocument(busyTab)).toBe(true);
    await expect(busyTab.getByRole("dialog")).toBeVisible();

    // Closing the dialog is its safe moment.
    const busyReload = busyTab.waitForEvent("load");
    await busyTab.keyboard.press("Escape");
    await busyReload;
    await waitForControl(busyTab);
    expect(await stillSameDocument(busyTab)).toBe(false);

    // Once no open page runs the old version, its cache goes.
    expect(await cacheNames(page)).toContain(oldCache);
    await expect.poll(() => reportedVersions(page).then((versions) => versions.length)).toBe(2);
    for (const tab of [page, busyTab]) {
      // oxlint-disable-next-line no-await-in-loop -- Reports are sent one tab at a time.
      await reportVersion(tab, newVersion);
    }
    await expect.poll(() => cacheNames(page)).not.toContain(oldCache);
    expect(await cacheNames(page)).toContain(newCache);
  } finally {
    restore();
  }
});

/** A route node chunk in `cacheName` that `page` hasn't loaded yet, as a path. */
async function unloadedNodeChunk(page: Page, cacheName: string): Promise<string> {
  const path = await page.evaluate(async (name) => {
    const loaded = new Set(
      performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname),
    );
    const cache = await caches.open(name);
    const requests = await cache.keys();
    const chunks = requests
      .map((request) => new URL(request.url).pathname)
      .filter((pathname) => pathname.includes("/_app/immutable/nodes/"));
    return chunks.find((pathname) => !loaded.has(pathname));
  }, cacheName);
  if (!path) throw new Error(`No unloaded route chunk in ${cacheName}`);
  return path;
}

test("keeps serving an old page's lazy chunks from its version's cache after the update", async ({
  context,
  page,
}) => {
  await page.goto("/en/about");
  await waitForControl(page);
  await expect.poll(() => reportedVersions(page).then((versions) => versions.length)).toBe(1);
  const oldCache = versionCacheOf(await cacheNames(page));
  const chunk = await unloadedNodeChunk(page, oldCache);

  // Busy, so it stays on the old version after the new one takes over.
  await page.getByRole("button", { name: "AI disclosure" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await markDocument(page);

  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;
  try {
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return registration.active?.state === "activated" && registration.waiting === null;
        }),
      )
      .toBe(true);
    await expect.poll(() => cacheNames(page)).toContain(newCache);

    // Make the old version's cache the only copy of the chunk, as after a real deploy: the new
    // build doesn't have it, and the server no longer serves it.
    await page.evaluate(
      async ([name, path]) => {
        const cache = await caches.open(name);
        await cache.delete(path);
      },
      [newCache, chunk],
    );
    await context.route(
      (url) => url.pathname === chunk,
      (route) => route.fulfill({ body: "Not Found", status: 404 }),
    );

    const imported = await page.evaluate(async (path) => {
      try {
        await import(/* @vite-ignore */ path);
        return true;
      } catch {
        return false;
      }
    }, chunk);
    expect(imported).toBe(true);
    expect(await stillSameDocument(page)).toBe(true);
  } finally {
    restore();
  }
});

function isEnglishHome(url: URL): boolean {
  return url.pathname === "/en";
}

test("reloads an uncontrolled page from the network even with an old active worker", async ({
  context,
  page,
}) => {
  await page.goto("/en");
  await waitForControl(page);
  const oldCache = versionCacheOf(await cacheNames(page));

  // Model a hard reload that bypassed the worker, while its registration remains active.
  const session = await context.newCDPSession(page);
  await Promise.all([
    page.waitForEvent("load"),
    session.send("Page.reload", { ignoreCache: true }),
  ]);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state;
    }),
  ).toBe("activated");

  await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    await cache.put(
      "/en",
      new Response("Cached old build", { headers: { "content-type": "text/html" } }),
    );
  }, oldCache);
  await context.route(isEnglishHome, async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      body: html.replace("</head>", '<meta name="pwa-build-source" content="network"></head>'),
      response,
    });
  });
  const { restore } = deployNewVersion(oldCache.slice("cache-".length));
  try {
    // An idle page reloads on detection, with no prompt to accept.
    const reload = page.waitForEvent("load");
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    await reload;
    expect(
      await page.evaluate(() =>
        document.head.querySelector('meta[name="pwa-build-source"]')?.getAttribute("content"),
      ),
    ).toBe("network");
    await expect(page.getByRole("main")).toBeVisible();
  } finally {
    restore();
    await session.detach();
  }
});

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
 * Waits for the new version to be the active one: the newest worker itself has activated, with no
 * other installing. Its cache exists from the start of its install, so that alone proves nothing;
 * going offline mid-install would fail it and leave the old version active. A worker restarting
 * mid-check just reads again.
 */
async function waitForTakeover(context: BrowserContext, newCache: string): Promise<void> {
  await expect
    .poll(async () => {
      try {
        return await context
          .serviceWorkers()
          .at(-1)
          ?.evaluate(async (name) => {
            const { registration, serviceWorker } = globalThis as unknown as {
              registration: ServiceWorkerRegistration;
              serviceWorker: ServiceWorker;
            };
            const names = await caches.keys();
            return (
              serviceWorker.state === "activated" &&
              registration.active === serviceWorker &&
              registration.installing === null &&
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

function lastLocale(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const record = await caches.match("/__last-locale");
    return record?.json() as Promise<unknown>;
  });
}

// A new version reads the last-used locale partway through its install. A language switch after
// that read, but before the install finishes, must still reach it: the next launch may be offline
// (#18).
test("relaunches offline in a language chosen while a new version was installing", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await waitForControl(page);
  await expect.poll(() => lastLocale(page)).toBe("en");

  const oldCache = versionCacheOf(await cacheNames(page));
  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;

  // The new version precaches the English home page right after reading the offline locales. Hold
  // that fetch until the switch below has happened.
  const { promise: homeHeld, resolve: releaseHome } = Promise.withResolvers<boolean>();
  const { promise: localeRead, resolve: homeRequested } = Promise.withResolvers<boolean>();
  await context.route(isEnglishHome, async (route) => {
    homeRequested(true);
    await homeHeld;
    await route.continue();
  });

  try {
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    await localeRead;

    await page.getByRole("button", { name: "Quick settings" }).click();
    await page.getByRole("button", { name: "Choose language" }).click();
    await page.getByRole("button", { name: /^日本語/ }).click();
    await expect(page).toHaveURL(/\/ja$/);
    await expect.poll(() => lastLocale(page)).toBe("ja");
    // Let the active version finish caching Japanese's pages first. Chromium stops it for the
    // takeover once idle, and a request restarting it then holds the takeover off: under
    // Playwright, the restarted worker never reads as idle.
    const japanesePages = PRERENDERED_ROUTES.map((route) => `/ja${route}`);
    await expect
      .poll(async () => {
        const cached = await Promise.all(
          japanesePages.map(async (path) => cacheHolds(page, oldCache, path)),
        );
        return cached.every(Boolean);
      })
      .toBe(true);

    // The idle page reloads onto the new version once it takes over.
    const reloaded = page.waitForEvent("load");
    releaseHome(true);
    await waitForTakeover(context, newCache);
    await reloaded;
    await waitForControl(page);
    await context.unroute(isEnglishHome);
    // The switch reached the installing version itself, not only the active one. Waited for before
    // going offline: the new version's own fetch may still be in flight.
    await expect.poll(() => cacheHolds(page, newCache, "/ja")).toBe(true);

    // Force-quit and go offline: the next launch can't fetch what it's missing.
    await goOffline(context);
    await page.close();
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
  const oldCache = versionCacheOf(await cacheNames(page));
  await expect.poll(() => cacheHolds(page, oldCache, "/en")).toBe(true);
  await markDocument(page);

  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;
  await context.route(isEnglishHome, (route) =>
    route.fulfill({ body: "Unavailable", status: 503 }),
  );

  try {
    // Before reloading onto the new version, the idle page probes its own URL.
    const probed = page.waitForResponse(
      (response) =>
        isEnglishHome(new URL(response.url())) && response.request().resourceType() === "fetch",
    );
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    await waitForTakeover(context, newCache);
    // It answers 503, so the page stays: an unprompted reload never swaps a working page for an
    // error.
    const probe = await probed;
    expect(probe.status()).toBe(503);
    expect(await stillSameDocument(page)).toBe(true);
    expect(await cacheHolds(page, newCache, "/en")).toBe(false);

    await goOffline(context);
    await page.close();
    const relaunched = await context.newPage();
    await relaunched.goto("/");
    await expect(relaunched).toHaveURL(/\/en$/);
    await expect(relaunched.getByRole("main")).toBeVisible();
    await expect(relaunched.getByRole("heading", { name: /offline/i })).toBeHidden();
    expect(await cacheNames(relaunched)).toContain(oldCache);

    // Back online, the next load's message caches the home page in the new version, and the old
    // version's cache goes once no page runs that version.
    await context.unroute(isEnglishHome);
    await goOnline(context);
    await relaunched.reload();
    await waitForControl(relaunched);
    await expect.poll(() => cacheHolds(relaunched, newCache, "/en")).toBe(true);
    await expect
      .poll(() => reportedVersions(relaunched).then((versions) => versions.length))
      .toBe(1);
    await reportVersion(relaunched, newVersion);
    await expect.poll(() => cacheNames(relaunched)).not.toContain(oldCache);
  } finally {
    restore();
  }
});

// The reloaded page asks for its own locale & English, so their pages may come from its message.
// Japanese, used earlier, is an offline locale no page asks for, so its pages prove the install's
// precache (#110, #204).
test("precaches `/` & each offline locale's pages when a new version installs", async ({
  context,
  page,
}) => {
  await page.goto("/ja");
  await waitForControl(page);
  await expect.poll(() => lastLocale(page)).toBe("ja");
  await page.goto("/fr");
  await waitForControl(page);
  await expect.poll(() => lastLocale(page)).toBe("fr");

  const oldCache = versionCacheOf(await cacheNames(page));
  const { newVersion, restore } = deployNewVersion(oldCache.slice("cache-".length));
  const newCache = `cache-${newVersion}`;

  try {
    await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
    await waitForTakeover(context, newCache);
    for (const path of ["/", "/en", "/fr", "/fr/museum", "/ja", "/ja/museum", "/ja/everything"]) {
      // oxlint-disable-next-line no-await-in-loop -- One assertion per page, for its message.
      expect(await cacheHolds(page, newCache, path), path).toBe(true);
    }
    expect(await cacheHolds(page, newCache, "/ko")).toBe(false);
    expect(await cacheHolds(page, newCache, "/ko/museum")).toBe(false);

    await goOffline(context);
    await page.close();
    const relaunched = await context.newPage();
    await relaunched.goto("/");
    await expect(relaunched).toHaveURL(/\/fr$/);
    await expect(relaunched.getByRole("main")).toBeVisible();
  } finally {
    restore();
  }
});
