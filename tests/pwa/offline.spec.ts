import { expect, test } from "@playwright/test";

test("registers, activates, and precaches the offline shell", async ({ page }) => {
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
  expect(cachedPaths).toContain("/offline.html");
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
