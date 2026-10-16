import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SKIP_WAITING_MESSAGE } from "#lib/pwa/service-worker-cache.js";

import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_RETRY_INTERVAL_MS,
  watchForAppUpdate,
} from "./app-update.js";

const stops: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
});

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  readonly update = vi.fn(() => Promise.resolve());
  waiting: FakeWorker | null = null;

  /** Plays out the browser finding and installing a new version. */
  install(worker: FakeWorker): void {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
    this.installing = null;
    this.waiting = worker;
    worker.become("installed");
  }
}

class FakeVisibility extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

class FakeWorker extends EventTarget {
  readonly postMessage = vi.fn();
  state: ServiceWorkerState = "installing";

  become(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

function refocus(visibility: FakeVisibility): void {
  visibility.visibilityState = "hidden";
  visibility.dispatchEvent(new Event("visibilitychange"));
  visibility.visibilityState = "visible";
  visibility.dispatchEvent(new Event("visibilitychange"));
}

async function watch({ controlled = true, waiting = null as FakeWorker | null } = {}) {
  const registration = new FakeRegistration();
  registration.waiting = waiting;
  const container = Object.assign(new EventTarget(), {
    controller: controlled ? ({} as ServiceWorker) : null,
    ready: Promise.resolve(registration as unknown as ServiceWorkerRegistration),
  });
  const visibility = new FakeVisibility();
  const clock = { now: 0 };
  const onUpdateReady = vi.fn<(activate: () => void) => void>();
  const reload = vi.fn();
  const events = new EventTarget();
  const { newVersionDetected, stop } = watchForAppUpdate({
    container,
    events,
    now: () => clock.now,
    onUpdateReady,
    reload,
    visibility,
  });
  stops.push(stop);
  await container.ready;
  return {
    clock,
    container,
    events,
    newVersionDetected,
    onUpdateReady,
    registration,
    reload,
    stop,
    visibility,
  };
}

describe("watchForAppUpdate", () => {
  it("announces a version that was already waiting when the page loaded", async () => {
    const waiting = new FakeWorker();
    const { onUpdateReady } = await watch({ waiting });

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("announces a version once it finishes installing", async () => {
    const { onUpdateReady, registration } = await watch();
    expect(onUpdateReady).not.toHaveBeenCalled();

    registration.install(new FakeWorker());

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("asks the newest waiting worker to take over when accepted", async () => {
    const { onUpdateReady, registration } = await watch();
    const first = new FakeWorker();
    const second = new FakeWorker();
    registration.install(first);
    registration.install(second);

    const [[activate]] = onUpdateReady.mock.calls as [[() => void]];
    activate();

    expect(first.postMessage).not.toHaveBeenCalled();
    expect(second.postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE });
  });

  it("reloads once when a new version takes control", async () => {
    const { container, reload } = await watch();

    container.dispatchEvent(new Event("controllerchange"));
    container.dispatchEvent(new Event("controllerchange"));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("neither announces nor reloads for the first-ever install", async () => {
    const { container, onUpdateReady, registration, reload } = await watch({ controlled: false });

    registration.install(new FakeWorker());
    container.dispatchEvent(new Event("controllerchange"));

    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads for an update that arrives after the first install claimed the page", async () => {
    const { container, reload } = await watch({ controlled: false });

    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();

    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves detection to SvelteKit, even after the old visibility interval", async () => {
    const { clock, registration, visibility } = await watch();

    refocus(visibility);
    expect(registration.update).not.toHaveBeenCalled();

    clock.now = UPDATE_CHECK_INTERVAL_MS;
    refocus(visibility);
    refocus(visibility);
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("installs immediately once a new version is detected, with no browser event", async () => {
    const { newVersionDetected, registration } = await watch();
    newVersionDetected();
    newVersionDetected();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it.each(["rejection", "no-op", "redundant"] as const)(
    "retries a %s on browser events, throttles attempts, and stops when waiting",
    async (failure) => {
      const { clock, events, newVersionDetected, registration, visibility } = await watch();
      if (failure === "rejection") registration.update.mockRejectedValueOnce(new Error("offline"));
      const worker = new FakeWorker();
      if (failure === "redundant") {
        registration.update.mockImplementationOnce(() => {
          registration.installing = worker;
          registration.dispatchEvent(new Event("updatefound"));
          return Promise.resolve();
        });
      }
      newVersionDetected();
      await vi.advanceTimersByTimeAsync(0);
      if (failure === "redundant") {
        registration.installing = null;
        worker.become("redundant");
      }
      events.dispatchEvent(new Event("online"));
      expect(registration.update).toHaveBeenCalledTimes(1);
      for (const event of ["online", "focus", "visibilitychange"]) {
        clock.now += UPDATE_CHECK_INTERVAL_MS;
        if (event === "visibilitychange") refocus(visibility);
        else events.dispatchEvent(new Event(event));
        // oxlint-disable-next-line no-await-in-loop -- Each event follows the previous completed attempt to test the throttle.
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(registration.update).toHaveBeenCalledTimes(4);
      registration.install(new FakeWorker());
      clock.now += UPDATE_RETRY_INTERVAL_MS;
      events.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(UPDATE_RETRY_INTERVAL_MS);
      expect(registration.update).toHaveBeenCalledTimes(4);
    },
  );

  it("retries hourly without browser events", async () => {
    const { clock, newVersionDetected, registration } = await watch();
    newVersionDetected();
    await vi.advanceTimersByTimeAsync(0);
    clock.now = UPDATE_RETRY_INTERVAL_MS;
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_INTERVAL_MS);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it("offers a reload on a detected deploy without a controlling worker", async () => {
    const { newVersionDetected, onUpdateReady, registration, reload } = await watch({
      controlled: false,
    });
    newVersionDetected();
    onUpdateReady.mock.calls[0]?.[0]();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("stops watching once stopped", async () => {
    const { clock, container, onUpdateReady, registration, reload, stop, visibility } =
      await watch();

    stop();
    registration.install(new FakeWorker());
    container.dispatchEvent(new Event("controllerchange"));
    clock.now = UPDATE_CHECK_INTERVAL_MS;
    refocus(visibility);

    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });
});
