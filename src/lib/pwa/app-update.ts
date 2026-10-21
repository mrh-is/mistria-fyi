import { CLIENT_VERSION_MESSAGE } from "#lib/pwa/client-versions.js";

import type { ClientVersionMessage } from "#lib/pwa/client-versions.js";

/** Failed installs retry on user/browser events at most this often. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;
export const UPDATE_RETRY_INTERVAL_MS = 60 * 60_000;

interface AppUpdateOptions {
  container?: UpdateContainer;
  events?: Pick<Window, "addEventListener">;
  now?: () => number;
  /**
   * Called once, when this page runs an older version than the newest one: a new worker has taken
   * control, or a deploy was detected with no worker to install it. Reloading then loads the new
   * version; the caller picks the moment.
   */
  onUpdateReady: () => void;
  visibility?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
}

type UpdateContainer = Pick<
  ServiceWorkerContainer,
  "addEventListener" | "controller" | "ready" | "removeEventListener"
>;

/**
 * Installs a detected deploy and reports when this page falls behind it. A new worker activates
 * on its own once installed (it calls `skipWaiting()`), keeping older versions' caches for the
 * pages still running them, so no tab has to consent. Detection belongs to SvelteKit; browser
 * events only retry an unsuccessful install.
 */
export function watchForAppUpdate({
  container = "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
  events = globalThis,
  now = Date.now,
  onUpdateReady,
  visibility = document,
}: AppUpdateOptions): { newVersionDetected: () => void; stop: () => void } {
  const controller = new AbortController();
  const { signal } = controller;

  let announced = false;
  let detected = false;
  let registration: ServiceWorkerRegistration | undefined;
  let lastCheck = -Infinity;
  let checking = false;
  let retryNeeded = false;
  let retryTimer: ReturnType<typeof setInterval> | undefined;

  function stopRetries(): void {
    retryNeeded = false;
    clearInterval(retryTimer);
    retryTimer = undefined;
  }

  function announce(): void {
    if (signal.aborted || announced) return;
    announced = true;
    stopRetries();
    onUpdateReady();
  }

  // Only a replaced controller means a new version. The first install claiming a page that loaded
  // without one isn't an update: that page is already on the newest version.
  let controlled = Boolean(container?.controller);
  container?.addEventListener(
    "controllerchange",
    () => {
      const wasControlled = controlled;
      controlled = true;
      if (wasControlled) announce();
    },
    { signal },
  );

  /** Whether a new version is on its way in, so no retry is needed. */
  function installing(): boolean {
    return Boolean(registration?.installing ?? registration?.waiting);
  }

  async function install(): Promise<void> {
    if (signal.aborted || !registration || checking || announced) return;
    // Already on its way in; a failed install marks a retry through `statechange`.
    if (installing()) {
      retryNeeded = false;
      return;
    }
    checking = true;
    retryNeeded = false;
    lastCheck = now();
    try {
      await registration.update();
    } catch {
      // Offline or a failed install: retry on an event or the hourly fallback.
    } finally {
      checking = false;
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- stop() can abort while update() is awaiting the browser.
      if (!signal.aborted && !announced) retryNeeded = !installing();
    }
  }

  function retry(): void {
    if (!retryNeeded || now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    void install();
  }

  function newVersionDetected(): void {
    if (signal.aborted || detected) return;
    detected = true;
    // No worker to install it: a reload from the network loads the new version.
    if (!container?.controller) {
      announce();
      return;
    }
    retryTimer = setInterval(retry, UPDATE_RETRY_INTERVAL_MS);
    void install();
  }

  const watchRegistration = async (): Promise<void> => {
    if (!container) return;
    registration = await container.ready;
    if (signal.aborted) return;
    function track(worker: null | ServiceWorker): void {
      worker?.addEventListener(
        "statechange",
        () => {
          if (worker.state === "redundant" && detected && !announced) retryNeeded = true;
        },
        { signal },
      );
    }

    track(registration.installing);
    registration.addEventListener(
      "updatefound",
      () => {
        track(registration?.installing ?? null);
      },
      { signal },
    );
    visibility.addEventListener(
      "visibilitychange",
      () => {
        if (visibility.visibilityState !== "visible") return;
        retry();
      },
      { signal },
    );
    events.addEventListener("focus", retry, { signal });
    events.addEventListener("online", retry, { signal });
    if (detected) void install();
  };
  void watchRegistration();

  return {
    newVersionDetected,
    stop: () => {
      controller.abort();
      stopRetries();
    },
  };
}

/**
 * Tells the active service worker which version this page runs. The worker keeps that version's
 * cache until no open page reports it, so the page can keep importing its own chunks after a newer
 * version takes over.
 */
export function reportClientVersion(
  version: string,
  container?: Pick<ServiceWorkerContainer, "ready">,
): void {
  // The DOM types promise a container, but browsers omit it outside secure contexts.
  const target = container ?? ("serviceWorker" in navigator ? navigator.serviceWorker : undefined);
  if (!target) return;
  const message: ClientVersionMessage = { type: CLIENT_VERSION_MESSAGE, version };
  void (async () => {
    const registration = await target.ready;
    registration.active?.postMessage(message);
  })();
}
