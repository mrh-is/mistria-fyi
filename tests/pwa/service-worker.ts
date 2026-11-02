import type { BrowserContext, CDPSession, Page, Route } from "@playwright/test";

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
 * Stands in for the idle timeout, which an attached debugger likely turns off. Chromium stops the
 * old worker for a takeover. A page request arriving during that stop starts it again, and the
 * takeover then waits: 30 s in an undebugged browser, but past the test's time under Playwright. So
 * when an active worker restarts with a new version waiting, this stops it again after a grace
 * period. A worker that hasn't stopped yet finishes its own work as it would for a player; one that
 * restarted gets only the grace period, so a test can't catch a restarted worker hanging.
 *
 * Each page gets its own debugging session, so a page opened after the first closes, such as a
 * relaunch, stays covered. Worker versions are browser-wide, so the sessions share what they've
 * seen, and any session still open can stop a worker.
 */
export async function stopRestartedWorkers(context: BrowserContext): Promise<void> {
  const sessions = new Set<CDPSession>();
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
    for (const session of sessions) {
      if (!isHoldingTakeover(versionId)) return;
      try {
        await session.send("ServiceWorker.stopWorker", { versionId });
        return;
      } catch (error) {
        // A closed session means its page closed; another page's may still be open. Anything
        // else would otherwise show only as a takeover timing out.
        if (!isClosedError(error)) throw error;
        sessions.delete(session);
      }
    }
  };
  const follow = async (page: Page): Promise<void> => {
    try {
      const session = await context.newCDPSession(page);
      sessions.add(session);
      page.once("close", () => sessions.delete(session));
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
    } catch (error) {
      // The page closed before its session attached, so it has no requests to cover.
      if (!isClosedError(error)) throw error;
    }
  };
  context.on("page", (page) => {
    void follow(page);
  });
  await Promise.all(context.pages().map(async (page) => follow(page)));
}

function isClosedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("closed");
}

/**
 * Waits for hydration. SvelteKit listens for focus & visibility changes, its deploy checks, only
 * from the end of hydration, so an event dispatched earlier is lost and the next check is its
 * 10-minute poll.
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
