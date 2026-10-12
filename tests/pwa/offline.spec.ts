import { expect, test } from "../browser/test.js";
import { waitForControl } from "./service-worker.js";

import type { BrowserContext, Page } from "@playwright/test";

test("registers, activates, and precaches static & build assets", async ({ page }) => {
  await page.goto("/");

  const serviceWorker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            resolve();
          },
          {
            once: true,
          },
        );
      });
    }
    const activeWorker = registration.active;
    if (activeWorker && activeWorker.state !== "activated") {
      await new Promise<void>((resolve) => {
        const handleStateChange = () => {
          if (activeWorker.state === "activated") {
            activeWorker.removeEventListener("statechange", handleStateChange);
            resolve();
          }
        };
        activeWorker.addEventListener("statechange", handleStateChange);
        handleStateChange();
      });
    }
    return {
      activeState: registration.active?.state,
      controlled: navigator.serviceWorker.controller !== null,
      scriptPath: new URL(registration.active?.scriptURL ?? location.href).pathname,
    };
  });

  expect(serviceWorker).toEqual({
    activeState: "activated",
    controlled: true,
    scriptPath: "/service-worker.js",
  });

  const cachedPaths = await page.evaluate(async () => {
    const cacheKeys = await caches.keys();
    const requests = await Promise.all(
      cacheKeys.map(async (cacheName) => {
        const cache = await caches.open(cacheName);
        return cache.keys();
      }),
    );
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toContain("/favicon.png");
  expect(cachedPaths.some((path) => path.startsWith("/_app/immutable/"))).toBe(true);
});

test("serves cached routes and assets offline, then falls back for an uncached navigation", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.goto("/animals");
  await expect(page.getByRole("main")).toBeVisible();

  // There's no unprefixed default locale, so /animals redirects to /en/animals — that's the
  // URL the service worker actually caches the navigation under.
  const cachedRoutePath = new URL(page.url()).pathname;
  await expect
    .poll(() =>
      page.evaluate(
        async (routePath) => ({
          asset: (await caches.match("/favicon.png")) !== undefined,
          route: (await caches.match(routePath)) !== undefined,
        }),
        cachedRoutePath,
      ),
    )
    .toEqual({ asset: true, route: true });

  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveURL(/\/animals$/);
  await expect(page.getByRole("main")).toBeVisible();
  const faviconOk = await page.evaluate(async () => {
    const response = await fetch("/favicon.png");
    return response.ok;
  });
  expect(faviconOk).toBe(true);

  await page.goto("/pwa-uncached-offline-probe");
  await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();

  // The site CSP blocks inline handlers, so retrying must work without script.
  const retry = page.getByRole("link", { name: "Try again" });
  await expect(retry).toHaveAttribute("href", "");
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll("*")].some((element) =>
        element.getAttributeNames().some((name) => name.startsWith("on")),
      ),
    ),
  ).toBe(false);

  await context.setOffline(false);
  await retry.click();
  await expect(page.getByRole("heading", { name: /offline/i })).toBeHidden();
});

async function startUrl(page: Page): Promise<string> {
  const response = await page.request.get("/manifest.json");
  const manifest = (await response.json()) as { start_url: string };
  return manifest.start_url;
}

/** Whether `path` is cached and the worker has recorded `locale` as the last one used. */
function readyOffline(page: Page, path: string, locale: string): Promise<boolean> {
  return page.evaluate(
    async ([home, expected]) => {
      const record = await caches.match("/__last-locale");
      const stored: unknown = await record?.json();
      const cached = await caches.match(home);
      return cached !== undefined && stored === expected;
    },
    [path, locale],
  );
}

async function launchOffline(context: BrowserContext, page: Page, url: string): Promise<void> {
  await context.setOffline(true);
  await page.goto(url);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { name: /offline/i })).toBeHidden();
}

test.describe("offline launch from start_url", () => {
  // The installed app's first online launch loads its page before the worker exists, and browsing
  // after that is client-side, so no page load ever passes through the worker (#728).
  test("opens the home page after one online launch and client-side browsing", async ({
    context,
    page,
  }) => {
    const url = await startUrl(page);
    expect(url).toBe("/");
    await page.goto(url);
    await waitForControl(page);
    await page
      .getByRole("link", { name: /^Animals/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/en\/animals$/);
    await expect.poll(() => readyOffline(page, "/en", "en")).toBe(true);

    await launchOffline(context, page, url);
    await expect(page).toHaveURL(/\/en$/);
  });

  test("opens the language last chosen in the picker", async ({ context, page }) => {
    const url = await startUrl(page);
    await page.goto(url);
    await waitForControl(page);
    await page.getByRole("button", { name: "Quick settings" }).click();
    await page.getByRole("button", { name: "Choose language" }).click();
    await page.getByRole("button", { name: /^Français/ }).click();
    await expect(page).toHaveURL(/\/fr$/);
    await expect.poll(() => readyOffline(page, "/fr", "fr")).toBe(true);

    await launchOffline(context, page, url);
    await expect(page).toHaveURL(/\/fr$/);
  });
});

test.describe("without service workers", () => {
  test.use({ serviceWorkers: "block" });

  test("keeps the online application usable", async ({ page }) => {
    await page.goto("/animals");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const registrationCount = await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length;
    });
    expect(registrationCount).toBe(0);
  });
});
