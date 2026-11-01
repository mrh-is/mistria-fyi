import type { BrowserContext, Page, Route } from "@playwright/test";

/**
 * Takes the context offline, service workers included. `setOffline` alone doesn't reach a worker
 * that starts afterward, such as an update activating after its last tab closed, so its fetches
 * would still reach the server. Chromium routes worker requests, so aborting them closes that gap.
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route("**/*", disconnect);
}

/** Reverses {@link goOffline}, leaving the context's other routes in place. */
export async function goOnline(context: BrowserContext): Promise<void> {
  await context.unroute("**/*", disconnect);
  await context.setOffline(false);
}

async function disconnect(route: Route): Promise<void> {
  await route.abort("internetdisconnected");
}

/** How long a restarted old worker gets to answer the request that restarted it. */
const RESTARTED_WORKER_GRACE_MS = 1000;

/**
 * Stands in for the idle timeout that an attached debugger turns off. Chromium stops the old worker
 * for a takeover. A page request arriving during that stop starts it again, and the takeover then
 * waits for it to go idle: 30 s in an undebugged browser, but never under Playwright. So when an
 * active worker restarts with a new version waiting, this stops it again. A worker still busy with
 * its own work never stopped, so it finishes as it would for a player.
 */
export async function stopRestartedWorkers(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const versions = new Map<string, { runningStatus: string; status: string }>();
  const stoppedWhileActive = new Set<string>();
  const isHoldingTakeover = (versionId: string): boolean => {
    const version = versions.get(versionId);
    return (
      version?.status === "activated" &&
      version.runningStatus === "running" &&
      stoppedWhileActive.has(versionId) &&
      [...versions.values()].some(({ status }) => status === "installed")
    );
  };
  const stopIfHoldingTakeover = async (versionId: string): Promise<void> => {
    if (!isHoldingTakeover(versionId)) return;
    try {
      await session.send("ServiceWorker.stopWorker", { versionId });
    } catch {
      // The test has ended, closing the session, so nothing is left to take over.
    }
  };
  session.on("ServiceWorker.workerVersionUpdated", ({ versions: updated }) => {
    for (const version of updated) {
      versions.set(version.versionId, version);
      if (version.status === "activated" && version.runningStatus === "stopped") {
        stoppedWhileActive.add(version.versionId);
      }
      if (!isHoldingTakeover(version.versionId)) continue;
      setTimeout(() => {
        void stopIfHoldingTakeover(version.versionId);
      }, RESTARTED_WORKER_GRACE_MS);
    }
  });
  await session.send("ServiceWorker.enable");
}

/**
 * Waits for hydration. SvelteKit listens for focus & visibility changes, its deploy checks, only
 * from the end of hydration, so an event dispatched earlier is lost and the page never updates.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
}

/** Waits for hydration and for a service worker to control the page. */
export async function waitForControl(page: Page): Promise<void> {
  await waitForHydration(page);
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
