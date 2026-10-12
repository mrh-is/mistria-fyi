import type { BrowserContext, Page } from "@playwright/test";

/**
 * Takes the context offline, service workers included. `setOffline` alone doesn't reach a worker
 * that starts afterward, such as an update activating after its last tab closed, so its fetches
 * would still reach the server. Chromium routes worker requests, so aborting them closes that gap.
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
}

/** Waits for hydration and for a service worker to control the page. */
export async function waitForControl(page: Page): Promise<void> {
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
