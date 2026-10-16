import { SKIP_WAITING_MESSAGE } from "#lib/pwa/service-worker-cache.js";

/** Failed installs retry on user/browser events at most this often. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;
export const UPDATE_RETRY_INTERVAL_MS = 60 * 60_000;

interface AppUpdateOptions {
  container?: UpdateContainer;
  events?: Pick<Window, "addEventListener">;
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
 * Installs a detected deploy, then offers the waiting worker for consent before switching builds.
 * Detection belongs to SvelteKit; browser events only retry an unsuccessful install.
 */
export function watchForAppUpdate({
  container = "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
  events = globalThis,
  now = Date.now,
  onUpdateReady,
  reload = () => {
    location.reload();
  },
  visibility = document,
}: AppUpdateOptions): { newVersionDetected: () => void; stop: () => void } {
  const controller = new AbortController();
  const { signal } = controller;

  // Only a replaced controller means a new version. The first install claiming a page that loaded
  // without one isn't an update: that page is already on the newest version.
  let controlled = Boolean(container?.controller);
  let reloading = false;
  container?.addEventListener(
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

  function announce(): boolean {
    if (!registration?.waiting || !container?.controller) return false;
    stopRetries();
    onUpdateReady(() => {
      // A newer deploy may have replaced the worker originally announced.
      registration?.waiting?.postMessage({ type: SKIP_WAITING_MESSAGE });
    });
    return true;
  }

  async function install(): Promise<void> {
    if (signal.aborted || !registration || checking || announce()) return;
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
      if (!signal.aborted && !announce()) retryNeeded = !registration.installing;
    }
  }

  function retry(): void {
    if (!retryNeeded || now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    void install();
  }

  function newVersionDetected(): void {
    if (signal.aborted || detected) return;
    detected = true;
    if (!container?.controller) {
      onUpdateReady(reload);
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
          if (worker.state === "installed") announce();
          if (worker.state === "redundant" && detected && !announce()) retryNeeded = true;
        },
        { signal },
      );
    }

    announce();
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
