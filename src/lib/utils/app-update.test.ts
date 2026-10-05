import { describe, expect, it, vi } from "vitest";

import { SKIP_WAITING_MESSAGE } from "#lib/engine/service-worker-cache.js";

import { UPDATE_CHECK_INTERVAL_MS, watchForAppUpdate } from "./app-update.js";

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
  const stop = watchForAppUpdate({
    container,
    now: () => clock.now,
    onUpdateReady,
    reload,
    visibility,
  });
  await container.ready;
  return { clock, container, onUpdateReady, registration, reload, stop, visibility };
}

describe("watchForAppUpdate", () => {
  it("announces a version that was already waiting when the page loaded", async () => {
    const waiting = new FakeWorker();
    const { onUpdateReady } = await watch({ waiting });

    expect(onUpdateReady).toHaveBeenCalledOnce();
  });

  it("announces a version once it finishes installing", async () => {
    const { onUpdateReady, registration } = await watch();
    expect(onUpdateReady).not.toHaveBeenCalled();

    registration.install(new FakeWorker());

    expect(onUpdateReady).toHaveBeenCalledOnce();
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

    expect(reload).toHaveBeenCalledOnce();
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
    expect(reload).toHaveBeenCalledOnce();
  });

  it("checks for a new version when the tab is refocused, at most once per interval", async () => {
    const { clock, registration, visibility } = await watch();

    refocus(visibility);
    expect(registration.update).not.toHaveBeenCalled();

    clock.now = UPDATE_CHECK_INTERVAL_MS;
    refocus(visibility);
    refocus(visibility);
    expect(registration.update).toHaveBeenCalledOnce();
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
