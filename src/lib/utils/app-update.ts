import { SKIP_WAITING_MESSAGE } from "#lib/engine/service-worker-cache.js";

/** Refocusing a tab checks for a new version at most this often. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;

interface AppUpdateOptions {
  container?: UpdateContainer;
  now?: () => number;
  /** Called when a new version is waiting. `activate` hands it control; every tab then reloads. */
  onUpdateReady: (activate: () => void) => void;
  reload?: () => void;
  visibility?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
}

type UpdateContainer = Pick<
  ServiceWorkerContainer,
  "addEventListener" | "controller" | "ready" | "removeEventListener"
>;

/**
 * Watches for a new service worker version and reloads onto it once any tab accepts. Returns a
 * function that stops watching.
 *
 * A new version installs and then waits while old tabs keep running on the previous worker and its
 * cache. Browsers look for a new worker only on full navigations, which client-side routing never
 * makes, so refocusing a tab also checks, throttled to {@link UPDATE_CHECK_INTERVAL_MS}.
 */
export function watchForAppUpdate({
  container = "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
  now = Date.now,
  onUpdateReady,
  reload = () => {
    location.reload();
  },
  visibility = document,
}: AppUpdateOptions): () => void {
  // The DOM types promise a container, but browsers omit it outside secure contexts.
  if (!container) return () => undefined;
  const controller = new AbortController();
  const { signal } = controller;

  // Only a replaced controller means a new version. The first install claiming a page that loaded
  // without one isn't an update: that page is already on the newest version.
  let controlled = container.controller !== null;
  let reloading = false;
  container.addEventListener(
    "controllerchange",
    () => {
      const wasControlled = controlled;
      controlled = true;
      if (!wasControlled || reloading) return;
      reloading = true;
      reload();
    },
    { signal },
  );

  let lastCheck = now();
  void container.ready.then((registration) => {
    if (signal.aborted) return;
    function announce(): void {
      if (!registration.waiting || !container?.controller) return;
      onUpdateReady(() => {
        // Whichever worker is waiting now: a newer deploy may have replaced the announced one.
        registration.waiting?.postMessage({ type: SKIP_WAITING_MESSAGE });
      });
    }
    function track(worker: null | ServiceWorker): void {
      worker?.addEventListener(
        "statechange",
        () => {
          if (worker.state === "installed") announce();
        },
        { signal },
      );
    }

    announce();
    track(registration.installing);
    registration.addEventListener(
      "updatefound",
      () => {
        track(registration.installing);
      },
      { signal },
    );
    visibility.addEventListener(
      "visibilitychange",
      () => {
        if (visibility.visibilityState !== "visible") return;
        if (now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
        lastCheck = now();
        // Best-effort: offline, or a server error, just means no update this time.
        registration.update().catch(() => undefined);
      },
      { signal },
    );
  });

  return () => {
    controller.abort();
  };
}
