import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_VERSION_MESSAGE } from "#lib/pwa/client-versions.js";

import {
  reportClientVersion,
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
  active: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  readonly update = vi.fn(() => Promise.resolve());
  waiting: FakeWorker | null = null;

  /** Plays out the browser finding a new version and installing it, up to waiting. */
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
  const onUpdateReady = vi.fn<() => void>();
  const events = new EventTarget();
  const { newVersionDetected, stop } = watchForAppUpdate({
    container,
    events,
    now: () => clock.now,
    onUpdateReady,
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
    stop,
    visibility,
  };
}

describe("watchForAppUpdate", () => {
  it("announces once when a new version takes control", async () => {
    const { container, onUpdateReady } = await watch();

    container.dispatchEvent(new Event("controllerchange"));
    container.dispatchEvent(new Event("controllerchange"));

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("neither announces nor activates a version that is merely installed", async () => {
    const waiting = new FakeWorker();
    const { onUpdateReady, registration } = await watch({ waiting });
    registration.install(new FakeWorker());

    // A new version activates itself; a page never hands it control.
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("doesn't announce the first-ever install", async () => {
    const { container, onUpdateReady } = await watch({ controlled: false });

    container.dispatchEvent(new Event("controllerchange"));

    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("announces an update that arrives after the first install claimed the page", async () => {
    const { container, onUpdateReady } = await watch({ controlled: false });

    container.dispatchEvent(new Event("controllerchange"));
    expect(onUpdateReady).not.toHaveBeenCalled();

    container.dispatchEvent(new Event("controllerchange"));
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
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
    const { newVersionDetected, onUpdateReady, registration } = await watch();
    newVersionDetected();
    newVersionDetected();
    expect(registration.update).toHaveBeenCalledTimes(1);
    // Installing isn't the update: the page reloads once the new version controls it.
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it.each(["rejection", "no-op", "redundant"] as const)(
    "retries a %s on browser events, throttles attempts, and stops once a version installs",
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

  it("stops retrying once the new version takes control", async () => {
    const { clock, container, newVersionDetected, registration } = await watch();
    registration.update.mockRejectedValueOnce(new Error("offline"));
    newVersionDetected();
    await vi.advanceTimersByTimeAsync(0);
    container.dispatchEvent(new Event("controllerchange"));
    clock.now = UPDATE_RETRY_INTERVAL_MS;
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_INTERVAL_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it("announces a detected deploy at once without a controlling worker", async () => {
    const { newVersionDetected, onUpdateReady, registration } = await watch({
      controlled: false,
    });
    newVersionDetected();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("stops watching once stopped", async () => {
    const { clock, container, newVersionDetected, onUpdateReady, registration, stop, visibility } =
      await watch();

    stop();
    newVersionDetected();
    container.dispatchEvent(new Event("controllerchange"));
    clock.now = UPDATE_CHECK_INTERVAL_MS;
    refocus(visibility);

    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });
});

describe("reportClientVersion", () => {
  it("tells the active worker which version the page runs", async () => {
    const registration = new FakeRegistration();
    const active = new FakeWorker();
    registration.active = active;
    const ready = Promise.resolve(registration as unknown as ServiceWorkerRegistration);

    reportClientVersion("2026.10.20 (abc)", { ready });
    await ready;
    await vi.advanceTimersByTimeAsync(0);

    expect(active.postMessage).toHaveBeenCalledWith({
      type: CLIENT_VERSION_MESSAGE,
      version: "2026.10.20 (abc)",
    });
  });
});
